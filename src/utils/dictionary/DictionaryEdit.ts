/**
 * A Dictionary Edit: one change to user dictionaries, described as data (CONTEXT.md
 * "Dictionary Edit", ADR-052).
 *
 * Every change records the value it replaced (`before`) as well as the value it writes
 * (`after`), with `undefined` meaning "key absent". That is what makes undo exact: the
 * inverse of an edit is the same changes with `before` and `after` swapped, so an Add over an
 * existing key, a rename onto an existing key and a move into a dictionary already holding
 * the key all restore what they overwrote.
 *
 * Pure: plans read the dictionaries they are given and never write. Committing (sort, save,
 * history, engine invalidation) is `commitEdit` in `DictionaryContext`.
 */

import type { DictionaryData, DictionaryEntryValue } from '../../types/DictionaryTypes';
import { canMoveBetween } from './DictionaryIdClassifier';
import { entryFields } from './EntryValue';

type StoredValue = DictionaryEntryValue | string;
export type Dictionaries = Record<string, DictionaryData>;

export interface EntryChange {
  dictionaryId: string;
  key: string;
  /** The value before the edit; `undefined` = the key was absent. */
  before: StoredValue | undefined;
  /** The value after the edit; `undefined` = the key is removed. */
  after: StoredValue | undefined;
}

/** One entry, named by the dictionary that holds it and its key. */
export interface EntryRef {
  dictionaryId: string;
  key: string;
}

/** What the edit did, for the caller's message. Plans set it; `invert` keeps it. */
export type EditOutcome =
  | { kind: 'added' }
  | { kind: 'overwritten' }
  | { kind: 'updated' }
  | { kind: 'deleted'; count: number; missing: EntryRef[] }
  | { kind: 'moved'; count: number; missing: string[] };

export interface DictionaryEdit {
  changes: EntryChange[];
  outcome: EditOutcome;
}

/** A request that cannot be planned against the current dictionaries. */
export interface InvalidPlan {
  invalid: string;
  /** Set when the plan failed because this dictionary is not in memory — which is also how
   * an unread dictionary looks, so the committer can say which it was. */
  missingDictionaryId?: string;
}

export type PlanResult = DictionaryEdit | InvalidPlan;

export function isInvalidPlan(result: PlanResult): result is InvalidPlan {
  return 'invalid' in result;
}

function missingDictionary(dictionaryId: string): InvalidPlan {
  return {
    invalid: `Dictionary '${dictionaryId}' does not exist`,
    missingDictionaryId: dictionaryId,
  };
}

/** Writes `value` at `key`, over whatever is there. */
export function planAdd(
  dicts: Dictionaries,
  dictionaryId: string,
  key: string,
  value: StoredValue
): PlanResult {
  const dict = dicts[dictionaryId];
  if (!dict) return missingDictionary(dictionaryId);
  const before = dict[key];
  return {
    changes: [{ dictionaryId, key, before, after: value }],
    outcome: { kind: before === undefined ? 'added' : 'overwritten' },
  };
}

/** Replaces the entry at `oldKey` with `value` at `newKey`. A rename onto an existing key
 * overwrites it, and the edit records the overwritten value. */
export function planUpdate(
  dicts: Dictionaries,
  dictionaryId: string,
  oldKey: string,
  newKey: string,
  value: StoredValue
): PlanResult {
  const dict = dicts[dictionaryId];
  if (!dict) return missingDictionary(dictionaryId);
  const changes: EntryChange[] = [];
  if (oldKey !== newKey && dict[oldKey] !== undefined) {
    changes.push({ dictionaryId, key: oldKey, before: dict[oldKey], after: undefined });
  }
  changes.push({ dictionaryId, key: newKey, before: dict[newKey], after: value });
  return { changes, outcome: { kind: 'updated' } };
}

/** Removes each present entry, in any number of dictionaries, as one edit; absent ones are
 * reported in `outcome.missing`. A target in a dictionary not in memory makes the whole plan
 * invalid, so nothing is deleted. */
export function planDelete(dicts: Dictionaries, targets: EntryRef[]): PlanResult {
  const changes: EntryChange[] = [];
  const missing: EntryRef[] = [];
  const seen = new Set<string>();
  for (const { dictionaryId, key } of targets) {
    const dict = dicts[dictionaryId];
    if (!dict) return missingDictionary(dictionaryId);
    const id = JSON.stringify([dictionaryId, key]);
    if (seen.has(id)) continue;
    seen.add(id);
    if (dict[key] === undefined) missing.push({ dictionaryId, key });
    else changes.push({ dictionaryId, key, before: dict[key], after: undefined });
  }
  return { changes, outcome: { kind: 'deleted', count: changes.length, missing } };
}

/** Moves each present key from `fromId` to `toId`, overwriting the target's value if it has
 * one; absent keys are reported in `outcome.missing`. */
export function planMove(
  dicts: Dictionaries,
  fromId: string,
  toId: string,
  keys: string[]
): PlanResult {
  const from = dicts[fromId];
  const to = dicts[toId];
  if (!from) {
    return { invalid: `Source dictionary '${fromId}' does not exist`, missingDictionaryId: fromId };
  }
  if (!to) {
    return { invalid: `Target dictionary '${toId}' does not exist`, missingDictionaryId: toId };
  }
  if (!canMoveBetween(fromId, toId)) {
    return {
      invalid: `Cannot move entries from '${fromId}' to '${toId}' — incompatible dictionary types`,
    };
  }
  const changes: EntryChange[] = [];
  const missing: string[] = [];
  let count = 0;
  for (const key of new Set(keys)) {
    const value = from[key];
    if (value === undefined) {
      missing.push(key);
      continue;
    }
    changes.push({ dictionaryId: fromId, key, before: value, after: undefined });
    changes.push({ dictionaryId: toId, key, before: to[key], after: value });
    count++;
  }
  return { changes, outcome: { kind: 'moved', count, missing } };
}

/** The entries a move plan replaces in its target: the keys the target already held, with
 * the value each had. Read from the plan itself, so a preview and the commit cannot disagree
 * about what a move overwrites. Empty for an invalid plan, and for a key the source lacks
 * (the plan skips it). */
export function overwrittenByMove(plan: PlanResult): Array<{ key: string; before: StoredValue }> {
  if (isInvalidPlan(plan)) return [];
  // Only the target's side of a move has an `after`; the source's side removes the key.
  return plan.changes.flatMap((c) =>
    c.before !== undefined && c.after !== undefined ? [{ key: c.key, before: c.before }] : []
  );
}

/** The edit that undoes `edit`. */
export function invert(edit: DictionaryEdit): DictionaryEdit {
  return {
    changes: edit.changes
      .slice()
      .reverse()
      .map((c) => ({ ...c, before: c.after, after: c.before })),
    outcome: edit.outcome,
  };
}

/** The dictionaries an edit touches, in first-touched order. */
export function touchedDictionaries(edit: DictionaryEdit): string[] {
  return [...new Set(edit.changes.map((c) => c.dictionaryId))];
}

/** `dicts` with `edit` applied. Only touched dictionaries are copied; key order inside them is
 * not meaningful (the committer sorts). */
export function applyEdit(dicts: Dictionaries, edit: DictionaryEdit): Dictionaries {
  const next: Dictionaries = { ...dicts };
  for (const id of touchedDictionaries(edit)) next[id] = { ...dicts[id] };
  for (const { dictionaryId, key, after } of edit.changes) {
    if (after === undefined) delete next[dictionaryId][key];
    else next[dictionaryId][key] = after;
  }
  return next;
}

function sameStringLists(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

/** Whether two stored values hold the same entry, field by field. A reload builds new objects
 * with the same data, so reference equality is not enough. */
export function sameEntryValue(a: StoredValue | undefined, b: StoredValue | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  const x = entryFields(a);
  const y = entryFields(b);
  return (
    x.translation === y.translation &&
    x.allowAsPatternVariable === y.allowAsPatternVariable &&
    x.semanticType === y.semanticType &&
    sameStringLists(x.allowedVariableTypes, y.allowedVariableTypes)
  );
}

/** Keys whose current value is no longer what `edit` expects to replace — something else
 * changed them since the edit was planned. A key in a dictionary that no longer exists counts
 * as changed. Empty means the edit can be applied exactly. */
export function changedKeys(edit: DictionaryEdit, dicts: Dictionaries): string[] {
  const changed: string[] = [];
  for (const { dictionaryId, key, before } of edit.changes) {
    const dict = dicts[dictionaryId];
    if (!dict || !sameEntryValue(dict[key], before)) changed.push(key);
  }
  return [...new Set(changed)];
}

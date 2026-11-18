import type { TransformRule } from '../../types/TransformRuleTypes';
import { validateTransformRule } from './TransformRuleValidation';
import { createAppFile, type AppFileReadable } from '../appFile';

/** Pre-2026-08-24 persisted rules stored the relocate flag as `moveWords: number`
 * (0/1, occasionally a legacy literal word count from before 2026-08-15 — see
 * GLOSSARY.md's "Transform Rule" entry). Coerce it to `relocate: boolean` on load so
 * every in-memory rule uses the current field regardless of when it was saved. Runs
 * on unvalidated raw data — BEFORE `validateTransformRule`, which checks the current
 * `relocate: boolean` shape only. */
function migrateLegacyMoveWords(raw: unknown[]): unknown[] {
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const legacy = item as Record<string, unknown> & { moveWords?: number };
    if (legacy.moveWords === undefined) return item;
    const { moveWords, ...rest } = legacy;
    return { ...rest, relocate: Boolean(moveWords) };
  });
}

/** Migrated, then validated; an item that fails validation is dropped and counted. */
function parseRules(data: unknown): { value: TransformRule[]; dropped: number } {
  const migrated = migrateLegacyMoveWords(Array.isArray(data) ? data : []);
  const value: TransformRule[] = [];
  for (const item of migrated) {
    const rule = validateTransformRule(item);
    if (rule) value.push(rule);
  }
  return { value, dropped: migrated.length - value.length };
}

/** `transform-rules.json` (GLOSSARY.md "App file"). A failed read throws: saving then would
 * replace every rule on disk with what this session made. */
const rulesFile = createAppFile<TransformRule[]>({
  fileName: 'transform-rules.json',
  what: 'Transform Rules (transform-rules.json)',
  load: () => window.electronAPI.loadTransformRules(),
  save: (rules) => window.electronAPI.saveTransformRules(rules),
  parse: parseRules,
  onUnreadable: 'throw',
  saveError: 'Failed to save transform rules',
});

/** `transform-rules.json` as a view reads it: render with `useTransformRules`. */
export const transformRulesFile: AppFileReadable<TransformRule[]> = rulesFile.readable;

export interface LoadTransformRulesResult {
  rules: TransformRule[];
  droppedCount: number;
}

export async function loadTransformRules(): Promise<LoadTransformRulesResult> {
  const { value, dropped } = await rulesFile.read();
  return { rules: value, droppedCount: dropped };
}

/** One change to the rule list: computed from the rules it is applied to, and throwing when
 * that list makes it invalid (a conflict). */
export type RuleChange = (rules: TransformRule[]) => TransformRule[];

/**
 * Saves one change. Changes run one at a time, in the order they were committed, each against
 * the rules that last saved successfully — so a failed save drops only its own change, and the
 * changes queued behind it re-plan without it. A change that throws at its turn saves nothing.
 */
export function commitRuleChange(change: RuleChange): Promise<TransformRule[]> {
  return rulesFile.transform((current) => {
    const next = change(current);
    return { value: next, result: next };
  });
}

/** Called on every change to the saved rules: a load, a save, an invalidate. */
export function subscribeTransformRules(listener: () => void): () => void {
  return rulesFile.subscribe(listener);
}

/** The saved rules, or `null` before the first load. Replaced, never mutated. */
export function getTransformRulesSnapshot(): TransformRule[] | null {
  return rulesFile.snapshot();
}

export function invalidateTransformRules(): void {
  rulesFile.invalidate();
}

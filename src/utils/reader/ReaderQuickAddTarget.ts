import { isFictionProperNounsId, toPatternsId } from '../dictionary/DictionaryIdClassifier';
import { resolveDefaultProperNounTarget } from '../dictionary/QuickAddTargetResolver';

/**
 * Where the Reader's two fiction Adds go: a proper noun (Cmd-5) and a structural pattern
 * (Cmd-6). Answered from the open book's binding, never from the fiction entries in config.
 *
 * The Translator has no book, so its Cmd-5/Cmd-6 ask config what the active fiction is.
 * The Reader must not: the fiction slice of config is a value the Reader itself wrote on
 * open, and when that write fails (`BookBindingContext` logs it and carries on, because a
 * book that will not bind must still be readable) config still names the *previous*
 * book's dictionary. Asking it would file this novel's names under the last novel — the
 * silent wrong-dictionary failure the binding exists to stop.
 *
 * So a fiction answer from config is never used here. What config does still own is the
 * non-fiction default (`properNouns`, or a theme like `properNouns-_Cultivation`) — a
 * standing Configuration choice that is right for any book without a fiction dictionary.
 */

export type ReaderQuickAddKind = 'properNoun' | 'structuralPattern';

/** The slice of app config the unbound case reads. `null` when it could not be loaded. */
export interface QuickAddConfig {
  defaultQuickAddDictionary: string | null;
  activeProperNouns: string[];
}

export type ReaderQuickAddTarget =
  { kind: 'open'; dictionaryId: string } | { kind: 'none'; message: string };

/** Whether `bound` names a fiction dictionary — the only case that needs no config. */
export function isBoundToFiction(bound: string | null): bound is string {
  // A binding can only ever name a fiction dictionary, but the record is read off disk and
  // repaired rather than trusted, so check rather than assume.
  return bound !== null && isFictionProperNounsId(bound);
}

export function readerQuickAddTarget(
  kind: ReaderQuickAddKind,
  bound: string | null,
  dictionaries: { [key: string]: unknown },
  config: QuickAddConfig | null
): ReaderQuickAddTarget {
  if (isBoundToFiction(bound)) {
    if (kind === 'properNoun') return { kind: 'open', dictionaryId: bound };
    // The pair is created atomically (ADR-027), so a missing patterns file means someone
    // deleted half a pair by hand — a repair to report, not something to bind.
    const patterns = toPatternsId(bound);
    return dictionaries[patterns] !== undefined
      ? { kind: 'open', dictionaryId: patterns }
      : {
          kind: 'none',
          message: `This book's structural pattern dictionary (${patterns}) is missing`,
        };
  }

  // No fiction dictionary for this book: unbound, answered "none", or a corrupt binding.
  if (kind === 'structuralPattern') {
    // Config's structural-pattern route can only ever name a fiction `patterns-f_*`.
    return {
      kind: 'none',
      message: 'This book has no structural pattern dictionary — bind one with Cmd+B',
    };
  }
  const nonFiction = config?.activeProperNouns.filter((id) => !isFictionProperNounsId(id)) ?? [];
  const resolved = resolveDefaultProperNounTarget(
    config?.defaultQuickAddDictionary ?? null,
    nonFiction
  );
  return { kind: 'open', dictionaryId: resolved ?? 'properNouns' };
}

import { isFictionProperNounsId } from '../dictionary/DictionaryIdClassifier';
import type { QuickAddView } from '../dictionary/QuickAddTarget';
import { activeProperNounsForBinding, quickAddTargetForBinding } from './BindingActivation';

/**
 * Where the Reader's two fiction Adds go — a proper noun (Cmd-5) and a structural pattern
 * (Cmd-6) — and which dictionaries every Reader Add's dropdown offers (`quickAddChoices`).
 * Answered from the open book's binding, never from the fiction entries in config.
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

/** Whether `bound` names a fiction dictionary — the only case that needs no config. */
export function isBoundToFiction(bound: string | null): bound is string {
  // A binding can only ever name a fiction dictionary, but the record is read off disk and
  // repaired rather than trusted, so check rather than assume.
  return bound !== null && isFictionProperNounsId(bound);
}

/**
 * The quick-add view the Reader decides from: config as the open book's binding implies it —
 * the same arithmetic `BookBindingContext` writes into config on bind. The fiction slice and a
 * fiction default come only from the binding; a stale fiction left in config never reaches the
 * rule. Feed the result to `quickAddTarget` (utils/dictionary/QuickAddTarget.ts).
 *
 * `config` may be `null` (not loaded, or not needed because the book is bound): the view is then
 * built from the binding alone.
 */
export function readerQuickAddView(
  config: QuickAddView | null,
  bound: string | null
): QuickAddView {
  const fiction = isBoundToFiction(bound) ? bound : null;
  return {
    defaultQuickAddDictionary: quickAddTargetForBinding(
      fiction,
      config?.defaultQuickAddDictionary ?? null
    ),
    activeProperNouns: activeProperNounsForBinding(config?.activeProperNouns ?? [], fiction),
  };
}

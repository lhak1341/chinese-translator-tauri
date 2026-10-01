import { isFictionProperNounsId } from '../dictionary/DictionaryIdClassifier';
import type { QuickAddView } from '../dictionary/QuickAddTarget';
import type { BookBinding } from '../../types/ReaderTypes';

/**
 * Turning a book's binding into the config the engine initializes from.
 *
 * The open book is **authoritative for the fiction slice** of `activeProperNouns` and for
 * nothing else: generic (`properNouns`) and theme (`properNouns-_X`) entries are standing
 * choices the Configuration tab keeps owning. That split is the whole of the authority
 * rule — everything here is the arithmetic that implements it, kept out of React so the
 * rule is testable without an engine, a config file, or a mounted tab.
 */

/**
 * The `activeProperNouns` list a book's binding implies: every non-fiction entry kept in
 * place, and the fiction slice replaced by exactly the bound dictionary — or by nothing,
 * which is what the remembered answer "no fiction dictionary" means.
 *
 * Replacing rather than adding is the point. A list left over from the previous book (or
 * from years of Configuration checkbox toggles) can carry several fiction dictionaries;
 * leaving those active would translate this book's proper nouns against another novel's
 * names, which is exactly the silent wrong-dictionary failure the binding exists to stop.
 */
export function activeProperNounsForBinding(
  current: readonly string[],
  bound: string | null
): string[] {
  const kept = current.filter((id) => !isFictionProperNounsId(id));
  return bound ? [...kept, bound] : kept;
}

/**
 * The `activeProperNouns` list after the Configuration tab toggles `dictionaryId` on or off.
 *
 * With a book open the toggle starts from the list that book's binding implies, not the
 * saved one: a saved list can still carry the previous book's fiction dictionary, and
 * toggling a generic entry on top of it would write that dictionary back into config. With no
 * book open (`openBook` null) the saved list is the starting point as it stands.
 *
 * Only the list changes. A toggle never touches the quick-add default, which is why this is
 * not a `bindingConfigChange` edit — that one moves both fields together.
 */
export function activeProperNounsAfterToggle(
  current: readonly string[],
  dictionaryId: string,
  openBook: { bound: string | null } | null
): string[] {
  const start = openBook ? activeProperNounsForBinding(current, openBook.bound) : [...current];
  return start.includes(dictionaryId)
    ? start.filter((id) => id !== dictionaryId)
    : [...start, dictionaryId];
}

/**
 * The default quick-add dictionary a binding implies.
 *
 * Binding a fiction dictionary points quick-add at it — that is the setting the reader
 * would otherwise have to remember to change per book. Binding *nothing* only clears a
 * default that pointed at some fiction dictionary (it would now be inactive, and
 * `quickAddTarget` would fall through to its tier order instead); a
 * generic or theme default is a standing choice and is left alone.
 */
export function quickAddTargetForBinding(
  bound: string | null,
  currentDefault: string | null
): string | null {
  if (bound) return bound;
  return currentDefault && isFictionProperNounsId(currentDefault) ? null : currentDefault;
}

/**
 * The fiction dictionary in use for the open book: the recorded answer, unless its dictionary
 * no longer exists on disk (`missing`), in which case the book reads with none. What
 * anything filing or reading "this book's names" decides from — never `binding` itself.
 */
export function dictionaryInUse(
  binding: BookBinding | null,
  missing: string | null
): string | null {
  return missing ? null : (binding?.fictionDictionary ?? null);
}

/** The two config fields a binding writes. */
export interface BindingConfigFields {
  activeProperNouns: readonly string[];
  defaultQuickAddDictionary: string | null;
}

export interface BindingConfigChange {
  activeProperNouns: string[];
  defaultQuickAddDictionary: string | null;
  /** The active list differs from `current`'s: the engine's dictionary set changed. */
  activeChanged: boolean;
  /** Either field differs from `current`'s. A quick-add default that moved on its own is a
   * config write with no engine consequence — the engine never reads that key. */
  changed: boolean;
}

/**
 * The config a binding implies, from `current`, and what that changed — the one place the
 * "diff the active list and the quick-add default" step lives, for an answer (`binding`) and
 * for a tier move (`activate`, then the binding if a book is open).
 *
 * `activate` adds a dictionary to the active list when it is not there (promoting a fiction
 * dictionary activates the generic it becomes, so its books keep its names). `binding`
 * applies a book's answer on top; leave it out when no book is open, since only an open book
 * is authoritative for the fiction slice. Changes are measured against `current`, not
 * against the list after `activate`.
 */
export function bindingConfigChange(
  current: BindingConfigFields,
  edit: { activate?: string; binding?: { bound: string | null } }
): BindingConfigChange {
  let activeProperNouns = [...current.activeProperNouns];
  let defaultQuickAddDictionary = current.defaultQuickAddDictionary;
  if (edit.activate && !activeProperNouns.includes(edit.activate)) {
    activeProperNouns.push(edit.activate);
  }
  if (edit.binding) {
    activeProperNouns = activeProperNounsForBinding(activeProperNouns, edit.binding.bound);
    defaultQuickAddDictionary = quickAddTargetForBinding(
      edit.binding.bound,
      defaultQuickAddDictionary
    );
  }
  const activeChanged =
    activeProperNouns.length !== current.activeProperNouns.length ||
    activeProperNouns.some((id, index) => id !== current.activeProperNouns[index]);
  return {
    activeProperNouns,
    defaultQuickAddDictionary,
    activeChanged,
    changed: activeChanged || defaultQuickAddDictionary !== current.defaultQuickAddDictionary,
  };
}

/** Whether `bound` names a fiction dictionary. A binding can only ever name one, but the
 * record is read off disk and repaired rather than trusted, so check rather than assume. */
function isBoundToFiction(bound: string | null): bound is string {
  return bound !== null && isFictionProperNounsId(bound);
}

/**
 * The quick-add view while a book is open: config as the open book's binding implies it —
 * the same arithmetic `BookBindingContext` writes into config on bind. Every Add in the app
 * decides over it while a book is open (the provider's `loadQuickAddView`); feed it to
 * `quickAddTarget` (utils/dictionary/QuickAddTarget.ts).
 *
 * The fiction slice and a fiction default come only from the binding, never from config.
 * The fiction slice of config is a value the binding itself wrote on open, and when that
 * write fails (`BookBindingContext` logs it and carries on, because a book that will not
 * bind must still be readable) config still names the *previous* book's dictionary. Asking
 * it would file this novel's names under the last novel — the silent wrong-dictionary
 * failure the binding exists to stop. What config does still own is everything
 * non-fiction: the active root, custom and generic dictionaries (the Add dropdown offers
 * them) and a non-fiction default (`properNouns`, or a theme like
 * `properNouns-_Cultivation`) — a standing Configuration choice right for any book.
 *
 * `config` may be `null` (it failed to load): the view is then built from the binding
 * alone, which loses the non-fiction dictionaries — so callers read config for a bound book
 * too.
 */
export function quickAddViewForBinding(
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

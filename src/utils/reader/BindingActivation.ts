import { isFictionProperNounsId } from '../dictionary/DictionaryIdClassifier';

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

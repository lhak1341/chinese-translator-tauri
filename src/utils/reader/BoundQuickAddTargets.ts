import { isFictionProperNounsId, toPatternsId } from '../dictionary/DictionaryIdClassifier';

/**
 * The two quick-add targets that mean "the active fiction's dictionaries", resolved from
 * the open book's binding instead of from config.
 *
 * The Translator has no book, so its Cmd-5/Cmd-6 have to ask config
 * (`resolveDefaultProperNounTarget` / `resolveStructuralPatternQuickAddTarget`) what the
 * active fiction is. The Reader does have one, and asking config there is a longer route
 * to the same answer through a value the Reader itself wrote on open — so it is only as
 * right as that write. When applying a binding fails (`BookBindingContext` logs it and
 * carries on, because a book that will not bind must still be readable), config still
 * names the *previous* book's dictionary, and a bar that reads it would confidently offer
 * to file this novel's names under the last novel. Reading the binding makes the bar's
 * label and its destination the same fact.
 *
 * `null` means "this book has no fiction dictionary" — unbound, bound to none, or a
 * pairing that is not on disk. The caller falls back to the config-driven resolvers,
 * which own the reporting for those cases.
 */
export interface BoundQuickAddTargets {
  /** Where a proper noun goes (Cmd-5). */
  properNouns: string | null;
  /** Where a structural pattern goes (Cmd-6). */
  structuralPatterns: string | null;
}

export function boundQuickAddTargets(
  bound: string | null,
  dictionaries: { [key: string]: unknown }
): BoundQuickAddTargets {
  // A binding can only ever name a fiction dictionary, but the record is read off disk
  // and repaired rather than trusted — so check rather than assume, and fall through to
  // the config resolvers if it is ever anything else.
  if (!bound || !isFictionProperNounsId(bound)) {
    return { properNouns: null, structuralPatterns: null };
  }
  // The pair is created atomically (ADR-027), so a missing patterns file means someone
  // deleted half a pair by hand. Report it as "no target" rather than pointing quick-add
  // at a dictionary that is not loaded.
  const patterns = toPatternsId(bound);
  return {
    properNouns: bound,
    structuralPatterns: dictionaries[patterns] !== undefined ? patterns : null,
  };
}

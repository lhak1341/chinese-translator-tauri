/**
 * Deriving a fiction-dictionary suggestion from a book's file name.
 *
 * The library's file names are `<Vietnamese title> <Chinese title>.txt`, and its fiction
 * dictionaries are the Vietnamese title with diacritics folded away and the words run
 * together: `Tạp đồ 卡徒.txt` → `properNouns-f_TapDo`.
 *
 * **The result is a suggestion, never a rule.** Measured against the real library it
 * lands on the right existing dictionary for 15 of 23 books; the other eight are
 * deliberate hand-shortenings — a franchise name for a fan work, a dropped trailing
 * "truyện", a spin-off sharing its parent series' set — that no derivation recovers. That
 * is why the binding dialog pre-fills this and then gets out of the way: picking a
 * different existing dictionary has to be as cheap as accepting the suggestion, because
 * a third of the time it is what the reader will do.
 */

import { FICTION_PROPER_NOUNS_PREFIX as FICTION_PREFIX } from '../dictionary/DictionaryIdClassifier';

/**
 * Vietnamese with its diacritics removed. Two steps, because Vietnamese needs both:
 * NFD splits `ắ` into `a` + combining marks (the horn, U+031B, included) which the range
 * strip then removes, but `đ`/`Đ` are their own code points with nothing to decompose and
 * have to be mapped by hand.
 */
function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/**
 * The slug for any human-written title: fold the diacritics, drop everything that is not a
 * Latin letter or digit (the Chinese title included), run the words together.
 *
 * Each word's first letter is upper-cased and the *rest of it is left alone*, so a Latin
 * word already carrying its own casing (`Hogwarts`, `DotA`) comes through intact rather
 * than flattened. `null` when nothing survives — the Chinese-only file name in the library
 * is a real case, not a defensive one.
 */
function toSlug(title: string): string | null {
  const words = foldDiacritics(title)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
}

/** The bare slug for a file name — `Ác ma pháp tắc 恶魔法则.txt` → `AcMaPhapTac`. */
export function deriveFictionSlug(fileName: string): string | null {
  return toSlug(fileName.replace(/\.[^./\\]+$/, ''));
}

export interface FictionSuggestion {
  /** The suggested `properNouns-f_*` id, or `null` when no slug could be derived. */
  dictionaryId: string | null;
  /** Whether that dictionary already exists — what separates "accept this binding" from
   * "create this pair" in the dialog, and the only thing the dialog needs to tell them
   * apart. */
  exists: boolean;
}

/**
 * The fiction dictionary to pre-fill the binding dialog with, plus whether accepting it
 * binds something that exists or creates something new.
 */
export function suggestFictionDictionary(
  fileName: string,
  existingFictionIds: readonly string[]
): FictionSuggestion {
  const slug = deriveFictionSlug(fileName);
  if (!slug) return { dictionaryId: null, exists: false };
  const dictionaryId = `${FICTION_PREFIX}${slug}`;
  return { dictionaryId, exists: existingFictionIds.includes(dictionaryId) };
}

/** A fiction dictionary id with its `properNouns-f_` prefix stripped, for display. */
export function fictionDisplayName(dictionaryId: string): string {
  return dictionaryId.startsWith(FICTION_PREFIX)
    ? dictionaryId.slice(FICTION_PREFIX.length)
    : dictionaryId;
}

/**
 * The dictionary id a reader-typed fiction name becomes, e.g. `Tạp đồ` →
 * `properNouns-f_TapDo`. `null` when the name has nothing a slug can be built from.
 *
 * It goes through the *same* `toSlug` the file-name derivation uses, and that is the whole
 * point: Rust's `validate_dictionary_id` would happily accept `properNouns-f_Tạpđồ`, and
 * then `suggestFictionDictionary` — which folds — could never match the dictionary the
 * reader had just created, so the book would be offered "create a new pair" forever.
 * Mirrors `toProperNounsDictionaryId` for the fiction namespace, which is a pure transform
 * only: Rust stays the authority on id safety.
 */
export function toFictionDictionaryId(rawName: string): string | null {
  const slug = toSlug(rawName);
  return slug ? `${FICTION_PREFIX}${slug}` : null;
}

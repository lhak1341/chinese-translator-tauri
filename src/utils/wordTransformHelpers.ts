/**
 * Pure string transformation utilities for word-level capitalization and reordering.
 * Used by DictionaryEntry.tsx capitalization toolbar.
 */

type Direction = 'head' | 'tail';

/** True when `index` falls within the `n` words nearest the boundary edge that
 * `direction` points at ('tail' = last n words, 'head' = first n words). Shared
 * by the capitalize-except-N pair — the only operation that maps per-word rather
 * than slicing/reassembling the array. */
function isNearBoundary(index: number, length: number, n: number, direction: Direction): boolean {
  return direction === 'tail' ? index >= length - n : index < n;
}

/** Splits `words` into the `n` words nearest the boundary edge `direction` points
 * at (`near`) and everything else (`far`), preserving relative order within each.
 * Shared by the move/replace pairs — every one of them differs only in what goes
 * in `near`'s place and which end it's reassembled at. */
function splitAtBoundary(
  words: string[],
  n: number,
  direction: Direction
): { near: string[]; far: string[] } {
  return direction === 'tail'
    ? { near: words.slice(-n), far: words.slice(0, -n) }
    : { near: words.slice(0, n), far: words.slice(n) };
}

/** Capitalize the first letter of every word, lowercase the rest. */
export function titleCaseWords(text: string): string {
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function capitalizeExceptBoundaryN(text: string, n: number, direction: Direction): string {
  const words = text.split(' ');
  if (words.length <= n) return text;
  return words
    .map((word, index) =>
      isNearBoundary(index, words.length, n, direction)
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
}

/**
 * Capitalize all words except the last `n`, which are lowercased.
 * Returns the original text unchanged if it has no words.
 */
export function titleCaseExceptLastN(text: string, n: number): string {
  return capitalizeExceptBoundaryN(text, n, 'tail');
}

/**
 * Capitalize all words except the first `n`, which are lowercased.
 * Head-anchored mirror of `titleCaseExceptLastN` — for prefix-keyed Transform Rules.
 * Returns the original text unchanged if it has no words.
 */
export function capitalizeExceptFirstN(text: string, n: number): string {
  return capitalizeExceptBoundaryN(text, n, 'head');
}

/**
 * Move the `n` words nearest the boundary edge `direction` points at to the
 * opposite end of the string, preserving their relative order. Returns the
 * original text unchanged if there are not enough words to reorder.
 */
function moveBoundaryN(text: string, n: number, direction: Direction): string {
  const words = text.split(' ');
  if (words.length <= n) return text;
  const { near, far } = splitAtBoundary(words, n, direction);
  return (direction === 'tail' ? [...near, ...far] : [...far, ...near]).join(' ');
}

/**
 * Move the last `n` words to the beginning of the string.
 * Returns the original text unchanged if there are not enough words to reorder.
 */
export function moveLastNWordsToBeginning(text: string, n: number): string {
  return moveBoundaryN(text, n, 'tail');
}

/**
 * Move the first `n` words to the end of the string.
 * Head-anchored mirror of `moveLastNWordsToBeginning` — for prefix-keyed Transform Rules.
 * Returns the original text unchanged if there are not enough words to reorder.
 */
export function moveFirstNWordsToEnd(text: string, n: number): string {
  return moveBoundaryN(text, n, 'head');
}

/** Drops the `n` words nearest the boundary edge and relocates a single
 * `replacement` token to the opposite end — same opposite-end placement
 * `moveBoundaryN` would use, but replacing the near words instead of moving them. */
function replaceBoundaryNWithText(
  text: string,
  n: number,
  replacement: string,
  direction: Direction
): string {
  if (n <= 0) return text;
  const words = text.split(' ');
  if (words.length <= n) return text;
  const { far } = splitAtBoundary(words, n, direction);
  return (direction === 'tail' ? [replacement, ...far] : [...far, replacement]).join(' ');
}

/**
 * Drop the last `n` words and prepend `replacement` instead of moving them.
 * Suffix-keyed Transform Rule variant of `moveLastNWordsToBeginning`.
 */
export function replaceLastNWordsWithText(text: string, n: number, replacement: string): string {
  return replaceBoundaryNWithText(text, n, replacement, 'tail');
}

/**
 * Drop the first `n` words and append `replacement` instead of moving them.
 * Head-anchored mirror of `replaceLastNWordsWithText` — for prefix-keyed Transform Rules.
 */
export function replaceFirstNWordsWithText(text: string, n: number, replacement: string): string {
  return replaceBoundaryNWithText(text, n, replacement, 'head');
}

/** Drops the `n` words nearest the boundary edge and puts a single `replacement`
 * token in the SAME position they occupied (no relocation) — the in-place
 * counterpart to `replaceBoundaryNWithText`'s opposite-end placement. */
function replaceBoundaryNInPlace(
  text: string,
  n: number,
  replacement: string,
  direction: Direction
): string {
  if (n <= 0) return text;
  const words = text.split(' ');
  if (words.length <= n) return text;
  const { far } = splitAtBoundary(words, n, direction);
  return (direction === 'tail' ? [...far, replacement] : [replacement, ...far]).join(' ');
}

/**
 * Drop the last `n` words and append `replacement` in their place — same trailing
 * position, no relocation to the front. In-place variant of `replaceLastNWordsWithText`.
 */
export function replaceLastNWordsInPlace(text: string, n: number, replacement: string): string {
  return replaceBoundaryNInPlace(text, n, replacement, 'tail');
}

/**
 * Drop the first `n` words and prepend `replacement` in their place — same leading
 * position, no relocation to the end. In-place variant of `replaceFirstNWordsWithText`.
 */
export function replaceFirstNWordsInPlace(text: string, n: number, replacement: string): string {
  return replaceBoundaryNInPlace(text, n, replacement, 'head');
}

// Named baked-n variants — each is directly testable without mounting DictionaryEntry.

export const capitalizeAll = (text: string): string => titleCaseWords(text);
export const lowercaseAll = (text: string): string => text.toLowerCase();
export const capitalizeExceptLast = (text: string): string => titleCaseExceptLastN(text, 1);
export const capitalizeExceptLastTwo = (text: string): string => titleCaseExceptLastN(text, 2);
export const capitalizeExceptLastThree = (text: string): string => titleCaseExceptLastN(text, 3);
export const moveLastWordToBeginning = (text: string): string => moveLastNWordsToBeginning(text, 1);
export const moveLastTwoWordsToBeginning = (text: string): string =>
  moveLastNWordsToBeginning(text, 2);
export const moveLastThreeWordsToBeginning = (text: string): string =>
  moveLastNWordsToBeginning(text, 3);

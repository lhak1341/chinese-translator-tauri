/**
 * Pure string transformation utilities for word-level capitalization and reordering.
 * Used by DictionaryEntry.tsx capitalization toolbar.
 */

/** Capitalize the first letter of every word, lowercase the rest. */
export function titleCaseWords(text: string): string {
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Capitalize all words except the last `n`, which are lowercased.
 * Returns the original text unchanged if it has no words.
 */
export function titleCaseExceptLastN(text: string, n: number): string {
  const words = text.split(' ');
  if (words.length <= n) return text;
  return words
    .map((word, index) =>
      index >= words.length - n
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
}

/**
 * Move the last `n` words to the beginning of the string.
 * Returns the original text unchanged if there are not enough words to reorder.
 */
export function moveLastNWordsToBeginning(text: string, n: number): string {
  const words = text.split(' ');
  if (words.length <= n) return text;
  const tail = words.slice(-n);
  const head = words.slice(0, -n);
  return [...tail, ...head].join(' ');
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

import { describe, expect, test } from 'vitest';
import {
  capitalizeExceptFirstN,
  moveFirstNWordsToEnd,
  titleCaseExceptLastN,
  moveLastNWordsToBeginning,
  replaceLastNWordsWithText,
  replaceFirstNWordsWithText,
} from '../wordTransformHelpers';

describe('capitalizeExceptFirstN', () => {
  test('lowercases the first n words, title-cases the rest', () => {
    expect(capitalizeExceptFirstN('lao vuong quoc', 1)).toBe('lao Vuong Quoc');
  });

  test('n=0 title-cases every word', () => {
    expect(capitalizeExceptFirstN('lao vuong', 0)).toBe('Lao Vuong');
  });

  test('n covering every word lowercases all of them', () => {
    expect(capitalizeExceptFirstN('lao vuong', 2)).toBe('lao vuong');
  });

  test('returns text unchanged when n >= word count', () => {
    expect(capitalizeExceptFirstN('lao vuong', 5)).toBe('lao vuong');
  });

  test('normalizes mixed casing on the words it title-cases', () => {
    expect(capitalizeExceptFirstN('LAO vUOng QUOC', 1)).toBe('lao Vuong Quoc');
  });
});

describe('moveFirstNWordsToEnd', () => {
  test('moves the first n words to the end, preserving relative order', () => {
    expect(moveFirstNWordsToEnd('lao vuong quoc', 1)).toBe('vuong quoc lao');
  });

  test('moves first two words as a block', () => {
    expect(moveFirstNWordsToEnd('a b c d', 2)).toBe('c d a b');
  });

  test('returns text unchanged when n >= word count', () => {
    expect(moveFirstNWordsToEnd('lao vuong', 5)).toBe('lao vuong');
  });

  test('n=0 is a no-op', () => {
    expect(moveFirstNWordsToEnd('lao vuong', 0)).toBe('lao vuong');
  });
});

describe('replaceLastNWordsWithText', () => {
  test('drops the last n words and prepends the replacement instead of moving them', () => {
    expect(replaceLastNWordsWithText('Thai Nhac son mach', 2, 'dãy núi')).toBe('dãy núi Thai Nhac');
  });

  test('n=0 is a no-op, ignoring the replacement', () => {
    expect(replaceLastNWordsWithText('Thai Nhac son mach', 0, 'dãy núi')).toBe(
      'Thai Nhac son mach'
    );
  });

  test('returns text unchanged when n >= word count', () => {
    expect(replaceLastNWordsWithText('son mach', 5, 'dãy núi')).toBe('son mach');
  });
});

describe('replaceFirstNWordsWithText', () => {
  test('drops the first n words and appends the replacement instead of moving them', () => {
    expect(replaceFirstNWordsWithText('son mach Thai Nhac', 2, 'dãy núi')).toBe(
      'Thai Nhac dãy núi'
    );
  });

  test('n=0 is a no-op, ignoring the replacement', () => {
    expect(replaceFirstNWordsWithText('son mach Thai Nhac', 0, 'dãy núi')).toBe(
      'son mach Thai Nhac'
    );
  });

  test('returns text unchanged when n >= word count', () => {
    expect(replaceFirstNWordsWithText('son mach', 5, 'dãy núi')).toBe('son mach');
  });
});

describe('head-anchored pair composes symmetrically with the tail-anchored pair', () => {
  test('prefix rule: capitalize-except-first then move-first-to-end mirrors the suffix worked example', () => {
    // Suffix worked example (documented in CONTEXT.md): "nam kinh thành"
    // -> titleCaseExceptLastN(_,1) -> "Nam Kinh thành" -> moveLastNWordsToBeginning(_,1) -> "thành Nam Kinh"
    const suffixResult = moveLastNWordsToBeginning(titleCaseExceptLastN('nam kinh thanh', 1), 1);
    expect(suffixResult).toBe('thanh Nam Kinh');

    // Mirrored prefix case: "thanh nam kinh" with a prefix rule on "thanh"
    // -> capitalizeExceptFirstN(_,1) -> "thanh Nam Kinh" -> moveFirstNWordsToEnd(_,1) -> "Nam Kinh thanh"
    const prefixResult = moveFirstNWordsToEnd(capitalizeExceptFirstN('thanh nam kinh', 1), 1);
    expect(prefixResult).toBe('Nam Kinh thanh');
  });
});

import { describe, test, expect } from 'vitest';
import { getFirstGrapheme } from '../GraphemeHelper';

describe('getFirstGrapheme', () => {
  test('empty text gives an empty string', () => {
    expect(getFirstGrapheme('')).toBe('');
  });

  test('a plain character is returned as is', () => {
    expect(getFirstGrapheme('abc')).toBe('a');
    expect(getFirstGrapheme('你好')).toBe('你');
  });

  test('a precomposed Vietnamese letter is one grapheme', () => {
    expect(getFirstGrapheme('ảnh')).toBe('ả');
  });

  test('a base letter plus a combining mark is not split', () => {
    const decomposed = 'ảnh'; // "ả" as a + combining hook above
    expect(decomposed[0]).toBe('a'); // the partial character raw indexing would return
    expect(getFirstGrapheme(decomposed)).toBe('ả');
  });

  test('a character outside the BMP is not split into surrogates', () => {
    expect(getFirstGrapheme('\u{20BB7}x')).toBe('\u{20BB7}');
  });
});

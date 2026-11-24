import { describe, it, expect } from 'vitest';
import { assembleCharOnlyResult, type StampedToken } from '../text/CharOnlyAssembly';

const noPunct = (text: string) => text;
const punct = (text: string) => text.replace(/，/g, ',').replace(/。/g, '.');

/** Stamped tokens for a string of one-character tokens: `map` is what the stamping pass produced. */
function stamp(text: string, map: Record<string, string>): StampedToken[] {
  return [...text].map((value, i) => {
    const isHan = /[一-鿿]/.test(value);
    const translated = map[value];
    return {
      type: isHan ? 'chinese_char' : value === ' ' ? 'whitespace' : 'punctuation',
      value,
      end: i + 1,
      translated: translated ?? (isHan ? value : null),
      translationSource: translated ? 'characters' : null,
    };
  });
}

describe('assembleCharOnlyResult', () => {
  it('emits one unit per translated chinese_char, none for untranslated ones', () => {
    const { semanticArrays } = assembleCharOnlyResult(
      stamp('说别单', { 说: 'thuyết', 别: 'biệt' }),
      noPunct
    );

    expect(semanticArrays.original).toEqual(['说', '别']);
    expect(semanticArrays.translated).toEqual(['Thuyết', 'biệt']);
  });

  it('gives repeated words distinct, increasing positions that slice to their own text', () => {
    const tokens = stamp('说别说', { 说: 'thuyết', 别: 'biệt' });
    const { translatedText, semanticArrays } = assembleCharOnlyResult(tokens, noPunct);

    expect(translatedText).toBe('Thuyết biệt thuyết');
    const starts = semanticArrays.metadata.map((m) => m.translatedStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(3);
    semanticArrays.metadata.forEach((m, i) => {
      expect(translatedText.slice(m.translatedStart, m.translatedEnd)).toBe(
        semanticArrays.translated[i]
      );
    });
  });

  it('positions the capitalized first unit in the finished text', () => {
    const { translatedText, semanticArrays } = assembleCharOnlyResult(
      stamp('说', { 说: 'thuyết' }),
      noPunct
    );

    expect(translatedText).toBe('Thuyết');
    expect(semanticArrays.metadata[0].translatedStart).toBe(0);
    expect(semanticArrays.translated[0]).toBe('Thuyết');
  });

  it('applies the punctuation dictionary to the output', () => {
    const { translatedText } = assembleCharOnlyResult(
      stamp('说，别', { 说: 'thuyết', 别: 'biệt' }),
      punct
    );

    expect(translatedText).toBe('Thuyết, biệt');
  });

  it('leaves a digit-led word lowercase after a number', () => {
    const tokens: StampedToken[] = [
      { type: 'number', value: '500', end: 3, translated: '500', translationSource: null },
      {
        type: 'chinese_char',
        value: '年',
        end: 4,
        translated: 'năm',
        translationSource: 'characters',
      },
    ];
    expect(assembleCharOnlyResult(tokens, noPunct).translatedText).toBe('500 năm');
  });

  it('leaves a unit the search cannot find unmapped, without moving the next unit', () => {
    // 'é' as e + combining acute: finishing NFC-normalizes the text, so the unit is not found.
    const nfd = 'é';
    const { semanticArrays, translatedText } = assembleCharOnlyResult(
      stamp('说别', { 说: nfd, 别: 'biệt' }),
      noPunct
    );

    expect(semanticArrays.metadata[0].translatedStart).toBe(-1);
    const second = semanticArrays.metadata[1];
    expect(translatedText.slice(second.translatedStart, second.translatedEnd)).toBe('biệt');
  });

  it('returns empty arrays and text for no tokens', () => {
    const { translatedText, semanticArrays } = assembleCharOnlyResult([], noPunct);

    expect(translatedText).toBe('');
    expect(semanticArrays.original).toEqual([]);
  });
});

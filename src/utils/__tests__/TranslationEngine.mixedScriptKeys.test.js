/**
 * Dictionary keys that mix Han with ASCII digits or Latin letters (`绝对战警2`, `T恤`), tested
 * through Full Translation's entry point, `translateWithSegments`.
 *
 * A match reads the text from its start token to the next punctuation mark; digits and Latin
 * letters are part of that text, so a key holding them can match, and a key without them never
 * matches across them. Out of scope: full-width digits and letters (`２`, `Ⅱ`), which the
 * tokenizer types as punctuation, and case folding (`iphone` does not match `iPhone`). A phrase
 * key holding a digit loses that digit to Phase 3 (numbers), which runs before Phase 4.
 */
import { describe, expect, it } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';

const DICTIONARIES = {
  characters: {
    他: 'hắn',
    看: 'xem',
    了: 'rồi',
    绝: 'tuyệt',
    对: 'đối',
    战: 'chiến',
    警: 'cảnh',
    王: 'vương',
    五: 'năm',
    说: 'nói',
    恤: 'tuất',
  },
  phrases: { T恤: 'áo phông' },
  patterns: {},
  properNouns: {
    绝对战警2: 'Bad Boys II',
    王五: 'Vương Ngũ',
    X战警: 'X-Men',
  },
  conversion: {},
  punctuation: { '。': '.' },
};

async function translate(text) {
  const engine = createTranslationEngine();
  await engine.initialize(DICTIONARIES, { activeProperNouns: ['properNouns'] });
  return (await engine.translateWithSegments(text, {})).translatedText;
}

describe('dictionary keys holding digits or Latin letters', () => {
  it('a proper noun ending in a digit matches', async () => {
    expect(await translate('他看了绝对战警2。')).toBe('Hắn xem rồi Bad Boys II.');
  });

  it('a key without a digit does not match across one', async () => {
    // Was "Vương Ngũ 5 năm nói.": 王 took the whole key's translation and 五 was translated again.
    expect(await translate('王5五说。')).toBe('Vương 5 năm nói.');
  });

  it('a proper noun starting with a Latin letter matches', async () => {
    expect(await translate('他看了X战警。')).toBe('Hắn xem rồi X-Men.');
  });

  it('a phrase key starting with a Latin letter matches', async () => {
    expect(await translate('他看了T恤。')).toBe('Hắn xem rồi áo phông.');
  });
});

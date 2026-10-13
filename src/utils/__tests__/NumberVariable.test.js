import { describe, test, expect } from 'vitest';
import {
  translateNumeral,
  ordinalOf,
  addNumberVariables,
  patternsUseNumberVariable,
} from '../pattern/NumberVariable.js';

const tok = (value, extra = {}) => ({
  value,
  type: 'chinese_char',
  translated: null,
  translationSource: null,
  ...extra,
});

describe('translateNumeral', () => {
  test('a lone digit reads as a Vietnamese word', () => {
    expect(translateNumeral('七')).toBe('bảy');
    expect(translateNumeral('两')).toBe('hai');
    expect(translateNumeral('零')).toBe('không');
  });

  test('a lone 十 reads as mười (NumberProcessor itself skips it)', () => {
    expect(translateNumeral('十')).toBe('mười');
  });

  test('above ten stays as digits', () => {
    expect(translateNumeral('十五')).toBe('15');
    expect(translateNumeral('三十七')).toBe('37');
    expect(translateNumeral('三千二百十五')).toBe('3,215'); // NumberProcessor's own format
  });

  test('a run that is not a number returns null', () => {
    expect(translateNumeral('百')).toBeNull();
  });
});

describe('ordinalOf', () => {
  test('1 and 4 read differently in a rank; nothing else does', () => {
    expect(ordinalOf(translateNumeral('一'))).toBe('nhất');
    expect(ordinalOf(translateNumeral('四'))).toBe('tư');
    expect(ordinalOf(translateNumeral('二'))).toBeUndefined();
    expect(ordinalOf(translateNumeral('十'))).toBeUndefined();
    expect(ordinalOf(translateNumeral('十四'))).toBeUndefined(); // digits: "14"
  });
});

describe('addNumberVariables', () => {
  test('adds every numeral sub-span of a run as a number entry', () => {
    const cache = {};
    addNumberVariables([tok('三'), tok('十'), tok('七'), tok('大')], cache);

    expect(cache['三十七']).toEqual({
      translation: '37',
      source: 'number_pattern_variable',
      type: 'number',
    });
    expect(cache['十七'].translation).toBe('17');
    expect(cache['七'].translation).toBe('bảy');
    expect(cache['大']).toBeUndefined();
  });

  test('a numeral with a different ordinal reading carries it', () => {
    const cache = {};
    addNumberVariables([tok('一'), tok('四'), tok('七')], cache);
    expect(cache['一'].ordinal).toBe('nhất');
    expect(cache['四'].ordinal).toBe('tư');
    expect(cache['七']).not.toHaveProperty('ordinal');
  });

  test('adds an Arabic-number token as itself', () => {
    const cache = {};
    addNumberVariables([tok('12', { type: 'number' }), tok('大')], cache);
    expect(cache['12']).toEqual({
      translation: '12',
      source: 'number_pattern_variable',
      type: 'number',
    });
  });

  test('skips tokens an earlier phase already translated', () => {
    const cache = {};
    addNumberVariables([tok('七', { translated: 'Thất', translationSource: 'properNoun' })], cache);
    expect(cache['七']).toBeUndefined();
  });

  test('never replaces an existing entry for the same text', () => {
    const existing = {
      translation: 'thập vạn',
      source: 'phrases_pattern_variable',
      type: 'concept',
    };
    const cache = { 十万: existing };
    addNumberVariables([tok('十'), tok('万')], cache);
    expect(cache['十万']).toBe(existing);
  });
});

describe('patternsUseNumberVariable', () => {
  test('detects # in any pattern', () => {
    expect(
      patternsUseNumberVariable([{ originalPattern: 'X的Y' }, { originalPattern: '#大X之一' }])
    ).toBe(true);
    expect(patternsUseNumberVariable([{ originalPattern: 'X的Y' }])).toBe(false);
  });
});

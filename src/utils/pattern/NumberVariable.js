// @ts-check
import { NumberProcessor } from '../NumberProcessor.js';

/**
 * Number variable for patterns: `#` in "#大X之一" → "một trong # đại X".
 *
 * The WASM parser (`wasm-core/src/pattern_processor/parser.rs`) reads `#` as a
 * variable that accepts only cache entries of type NUMBER_VARIABLE_TYPE, and the
 * matcher keeps number entries away from letter variables. This module supplies
 * those entries: every numeral span in the text, added to the variable cache.
 */
export const NUMBER_VARIABLE = '#';
export const NUMBER_VARIABLE_TYPE = 'number';

// Longest numeral NumberProcessor converts without a 百分之/点 prefix: 七千七百七十七.
export const MAX_NUMERAL_SPAN = 8;

/** @type {Record<string, number>} */
const NUMERAL_VALUES = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};
const NUMERAL_CHARS = new Set([...Object.keys(NUMERAL_VALUES), '百', '千', '万']);

// Up to ten reads as Vietnamese words; above ten stays as NumberProcessor's digits.
const SMALL_NUMBER_WORDS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
  'mười',
];

/** @type {NumberProcessor | null} */
let numberProcessor = null;

/**
 * Translate a Chinese numeral string for use as a `#` value.
 * NumberProcessor has no rule for a lone digit (only 十, and that one it skips),
 * so single characters go through NUMERAL_VALUES instead.
 *
 * @param {string} text - e.g. "七", "三十七"
 * @returns {string|null} "bảy", "37", or null when text is not a number
 */
export function translateNumeral(text) {
  if (text in NUMERAL_VALUES) return SMALL_NUMBER_WORDS[NUMERAL_VALUES[text]];

  numberProcessor ??= new NumberProcessor();
  const converted = numberProcessor.convertSequence(text);
  if (!converted) return null;

  const value = Number(converted.result);
  if (Number.isInteger(value) && value >= 0 && value <= 10) return SMALL_NUMBER_WORDS[value];
  return converted.result;
}

/** @type {WeakMap<object[], boolean>} */
const usesNumberVariable = new WeakMap();

/**
 * Whether any pattern contains `#`. Memoized per patterns array, which is
 * built once per engine and passed on every chunk.
 * @param {Array<{originalPattern?: string}>} patterns
 */
export function patternsUseNumberVariable(patterns) {
  let result = usesNumberVariable.get(patterns);
  if (result === undefined) {
    result = patterns.some((p) => p.originalPattern?.includes(NUMBER_VARIABLE) === true);
    usesNumberVariable.set(patterns, result);
  }
  return result;
}

/**
 * @param {{value: string, type?: string, translated?: string|null, translationSource?: string|null}} token
 */
function isUntranslated(token) {
  return !token.translated && !token.translationSource;
}

/**
 * @param {{value: string}} token
 */
function isNumeralToken(token) {
  for (const ch of token.value) {
    if (!NUMERAL_CHARS.has(ch)) return false;
  }
  return token.value.length > 0;
}

/**
 * Add every numeral span in `tokens` to `cache` as a number entry: each run of
 * Chinese numeral tokens (all sub-spans up to MAX_NUMERAL_SPAN, since a pattern
 * literal can start or end anywhere inside a run) and each Arabic-number token.
 * Existing entries win, so a dictionary entry for the same text is never replaced.
 *
 * @param {Array<{value: string, type?: string, translated?: string|null, translationSource?: string|null}>} tokens
 * @param {Object.<string, {translation: string, source: string, type: string|null}>} cache
 */
export function addNumberVariables(tokens, cache) {
  const add = (/** @type {string} */ text, /** @type {string} */ translation) => {
    if (!(text in cache)) {
      cache[text] = { translation, source: 'number_pattern_variable', type: NUMBER_VARIABLE_TYPE };
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i];
    if (!isUntranslated(first)) continue;

    if (first.type === 'number') {
      add(first.value, first.value);
      continue;
    }

    let text = '';
    for (let end = i; end < tokens.length && end - i < MAX_NUMERAL_SPAN; end++) {
      const token = tokens[end];
      if (!isUntranslated(token) || !isNumeralToken(token)) break;
      text += token.value;
      const translation = translateNumeral(text);
      if (translation !== null) add(text, translation);
    }
  }
}

/**
 * Spacing-aware assembly of translated segments (postProcess Step 2 of TranslationEngine.js).
 *
 * Pure JavaScript. A WASM twin (`WasmTextAssembler` / `text_assembly.rs`) was deleted
 * 2026-10-06 (ADR-079): measured 15-25x slower than this code on real segment shapes.
 * Fixture: test-fixtures/text-assembly-parity.json (run by TextAssembly.parity.test.js).
 */

/**
 * Returns true when `tokenType` is a Chinese character or word type.
 * @param {string} tokenType
 * @returns {boolean}
 */
function isChinese(tokenType) {
  return tokenType === 'chinese_char' || tokenType === 'chinese_word';
}

/**
 * Determine whether a space should be inserted between `current` and `next`.
 *
 * The 11 spacing rules (fixture: test-fixtures/text-assembly-parity.json). Token type strings match `TextTokenizer.ts` `TokenType` enum values.
 *
 * @param {string} currentType
 * @param {string} nextType
 * @param {string} currentText
 * @param {string} nextText
 * @returns {boolean}
 */
export function needsSpace(currentType, nextType, currentText, nextText) {
  // Rule 1: Chinese → Chinese
  if (isChinese(currentType) && isChinese(nextType)) return true;
  // Rule 2: Chinese → opening punctuation (bracket/paren)
  if (
    isChinese(currentType) &&
    nextType === 'punctuation' &&
    (nextText.includes('[') || nextText.includes('('))
  )
    return true;
  // Rule 3: Chinese → punctuation starting with digit
  if (isChinese(currentType) && nextType === 'punctuation' && /^\d/.test(nextText)) return true;
  // Rule 4: punctuation → Chinese (not opening quote/bracket)
  if (
    currentType === 'punctuation' &&
    isChinese(nextType) &&
    !currentText.startsWith('"') &&
    !currentText.startsWith('\u201c') &&
    !currentText.endsWith('"') &&
    !currentText.endsWith('\u201c') &&
    !currentText.includes('[') &&
    !currentText.includes('(')
  )
    return true;
  // Rule 5: Chinese → latin_word
  if (isChinese(currentType) && nextType === 'latin_word') return true;
  // Rule 6: latin_word → Chinese
  if (currentType === 'latin_word' && isChinese(nextType)) return true;
  // Rule 7: Chinese → number
  if (isChinese(currentType) && nextType === 'number') return true;
  // Rule 8: number → Chinese
  if (currentType === 'number' && isChinese(nextType)) return true;
  // Rule 9: Chinese → unknown
  if (isChinese(currentType) && nextType === 'unknown') return true;
  // Rule 10: unknown → Chinese
  if (currentType === 'unknown' && isChinese(nextType)) return true;
  // Rule 11: Chinese → punctuation-typed token that's actually a non-CJK letter
  // (e.g. Greek "α", Cyrillic, or an accented Latin char — the tokenizer's punctuation
  // catch-all types any non-CJK/non-ASCII-letter/non-digit char as "punctuation", so a
  // bare foreign letter adjacent to a Chinese char never hit rules 1-10). The reverse
  // direction (punctuation-letter → Chinese) is already covered by rule 4, which returns
  // true for punctuation → Chinese unless it's a quote or bracket.
  if (isChinese(currentType) && nextType === 'punctuation' && /^\p{L}/u.test(nextText)) return true;
  return false;
}

/**
 * Join segments with `needsSpace` spacing and record each segment's position.
 * `start`/`end` are `.length` (UTF-16) indices into the assembled text.
 *
 * @param {Array<{text: string, tokenType: string, tokenIndex: number}>} segments
 * @returns {{ translatedText: string, positions: Array<{tokenIndex: number, text: string, start: number, end: number}> }}
 */
export function assembleWithSpacing(segments) {
  if (!segments || segments.length === 0) {
    return { translatedText: '', positions: [] };
  }

  let translatedText = '';
  let currentPosition = 0;
  const positions = [];

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    const next = i < segments.length - 1 ? segments[i + 1] : null;

    const start = currentPosition;
    translatedText += current.text;
    currentPosition += current.text.length;
    const end = currentPosition;

    positions.push({ tokenIndex: current.tokenIndex, text: current.text, start, end });

    if (next && needsSpace(current.tokenType, next.tokenType, current.text, next.text)) {
      translatedText += ' ';
      currentPosition += 1;
    }
  }

  return { translatedText, positions };
}

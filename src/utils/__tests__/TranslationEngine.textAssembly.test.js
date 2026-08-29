/**
 * Parity tests for the spacing-aware text assembly used in postProcess() Step 2.
 *
 * Documents the contract that both the JS reference implementation
 * (`jsAssembleWithSpacing`) and the Rust WASM implementation (`assemble_with_spacing`)
 * must satisfy. The JS version is the source of truth for correctness.
 *
 * The 10 spacing rules mirror those in `TranslationEngine.js:postProcess()` Step 2
 * (lines previously 4458-4605) and the Rust `needs_space()` in `text_assembly.rs`.
 *
 * Position invariants:
 * - `start`/`end` are UTF-16 code-unit counts in the assembled translated text.
 * - For Vietnamese (NFC BMP), `.length` in JS === `chars().count()` in Rust.
 * - Space is inserted AFTER the current segment's position entry is recorded.
 */

import { needsSpace } from '../wasm/WasmTextAssembler.js';

// ============================================================================
// Reference implementation (inline copy of jsAssembleWithSpacing)
// Allows tests to run without WASM initialization.
// ============================================================================

/**
 * @param {Array<{text: string, tokenType: string, tokenIndex: number}>} segments
 * @returns {{ translatedText: string, positions: Array<{tokenIndex: number, text: string, start: number, end: number}> }}
 */
function jsAssembleWithSpacing(segments) {
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

function seg(text, tokenType, tokenIndex = 0) {
  return { text, tokenType, tokenIndex };
}

// ============================================================================
// needsSpace() unit tests
// ============================================================================

describe('needsSpace()', () => {
  test('Rule 1: Chinese → Chinese → space', () => {
    expect(needsSpace('chinese_char', 'chinese_char', 'xin', 'chào')).toBe(true);
    expect(needsSpace('chinese_word', 'chinese_word', 'không', 'biết')).toBe(true);
    expect(needsSpace('chinese_char', 'chinese_word', 'a', 'b')).toBe(true);
  });

  test('Rule 2: Chinese → opening bracket/paren punctuation → space', () => {
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '[bar]')).toBe(true);
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '(bar)')).toBe(true);
    expect(needsSpace('chinese_word', 'punctuation', 'foo', '[')).toBe(true);
  });

  test('Rule 2: Chinese → closing punctuation (no bracket/paren) → no space', () => {
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '}')).toBe(false);
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '.')).toBe(false);
    expect(needsSpace('chinese_char', 'punctuation', 'foo', ',')).toBe(false);
  });

  test('Rule 3: Chinese → punctuation starting with digit → space', () => {
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '1%')).toBe(true);
    expect(needsSpace('chinese_word', 'punctuation', 'bar', '3/5')).toBe(true);
  });

  test('Rule 3: Chinese → punctuation NOT starting with digit → no extra space from this rule', () => {
    // Note: rule 2 may still fire if bracket present; here we test a plain closing punc.
    // Uses non-letter punctuation — a real punctuation-typed token can never start with an
    // ASCII letter (that's tokenized as latin_word instead); rule 11 covers the letter case.
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '%1')).toBe(false);
    expect(needsSpace('chinese_char', 'punctuation', 'foo', '@#$')).toBe(false);
  });

  test('Rule 4: closing punctuation → Chinese → space', () => {
    expect(needsSpace('punctuation', 'chinese_char', '.', 'xin')).toBe(true);
    expect(needsSpace('punctuation', 'chinese_word', ',', 'không')).toBe(true);
  });

  test('Rule 4: opening bracket → Chinese → NO space', () => {
    expect(needsSpace('punctuation', 'chinese_char', '(', 'xin')).toBe(false);
    expect(needsSpace('punctuation', 'chinese_char', '[', 'xin')).toBe(false);
  });

  test('Rule 4: opening straight quote → Chinese → NO space', () => {
    expect(needsSpace('punctuation', 'chinese_char', '"', 'xin')).toBe(false);
  });

  test('Rule 4: opening curly quote → Chinese → NO space', () => {
    expect(needsSpace('punctuation', 'chinese_char', '\u201c', 'xin')).toBe(false);
    // Ends with opening curly quote
    expect(needsSpace('punctuation', 'chinese_char', 'foo\u201c', 'xin')).toBe(false);
  });

  test('Rule 5: Chinese → latin_word → space', () => {
    expect(needsSpace('chinese_char', 'latin_word', 'foo', 'hello')).toBe(true);
    expect(needsSpace('chinese_word', 'latin_word', 'foo', 'VIP')).toBe(true);
  });

  test('Rule 6: latin_word → Chinese → space', () => {
    expect(needsSpace('latin_word', 'chinese_char', 'hello', 'foo')).toBe(true);
    expect(needsSpace('latin_word', 'chinese_word', 'world', 'bar')).toBe(true);
  });

  test('Rule 7: Chinese → number → space', () => {
    expect(needsSpace('chinese_char', 'number', 'foo', '42')).toBe(true);
    expect(needsSpace('chinese_word', 'number', 'foo', '3.14')).toBe(true);
  });

  test('Rule 8: number → Chinese → space', () => {
    expect(needsSpace('number', 'chinese_char', '42', 'foo')).toBe(true);
    expect(needsSpace('number', 'chinese_word', '3.14', 'bar')).toBe(true);
  });

  test('Rule 9: Chinese → unknown → space', () => {
    expect(needsSpace('chinese_char', 'unknown', 'foo', 'の')).toBe(true);
    expect(needsSpace('chinese_word', 'unknown', 'bar', 'の')).toBe(true);
  });

  test('Rule 10: unknown → Chinese → space', () => {
    expect(needsSpace('unknown', 'chinese_char', 'の', 'foo')).toBe(true);
    expect(needsSpace('unknown', 'chinese_word', 'の', 'bar')).toBe(true);
  });

  test('Rule 11: Chinese → punctuation-typed foreign letter → space', () => {
    // Greek/Cyrillic/accented Latin letters land in the punctuation catch-all
    // (not "latin_word", which is ASCII-only) — see text_tokenizer.rs's is_latin_letter.
    expect(needsSpace('chinese_char', 'punctuation', '于', 'α')).toBe(true);
    expect(needsSpace('chinese_word', 'punctuation', '于', 'Ж')).toBe(true);
  });

  test('No rule: Chinese → real punctuation → no new space from rule 11', () => {
    expect(needsSpace('chinese_char', 'punctuation', '于', '!')).toBe(false);
  });

  test('No rule: latin_word → latin_word → no space', () => {
    expect(needsSpace('latin_word', 'latin_word', 'hello', 'world')).toBe(false);
  });

  test('No rule: number → number → no space', () => {
    expect(needsSpace('number', 'number', '1', '2')).toBe(false);
  });

  test('No rule: unknown → unknown → no space', () => {
    expect(needsSpace('unknown', 'unknown', 'の', 'が')).toBe(false);
  });

  test('No rule: latin_word → number → no space', () => {
    expect(needsSpace('latin_word', 'number', 'x', '42')).toBe(false);
  });

  test('No rule: number → latin_word → no space', () => {
    expect(needsSpace('number', 'latin_word', '42', 'x')).toBe(false);
  });
});

// ============================================================================
// jsAssembleWithSpacing() — reference implementation tests
// ============================================================================

describe('jsAssembleWithSpacing()', () => {
  test('empty input returns empty result', () => {
    expect(jsAssembleWithSpacing([])).toEqual({ translatedText: '', positions: [] });
    expect(jsAssembleWithSpacing(null)).toEqual({ translatedText: '', positions: [] });
  });

  test('single segment — no space appended', () => {
    const result = jsAssembleWithSpacing([seg('xin chào', 'chinese_char', 0)]);
    expect(result.translatedText).toBe('xin chào');
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual({ tokenIndex: 0, text: 'xin chào', start: 0, end: 8 });
  });

  test('Rule 1: two Chinese segments get a space', () => {
    const result = jsAssembleWithSpacing([
      seg('xin', 'chinese_char', 0),
      seg('chào', 'chinese_char', 1),
    ]);
    expect(result.translatedText).toBe('xin chào');
    expect(result.positions[0]).toEqual({ tokenIndex: 0, text: 'xin', start: 0, end: 3 });
    expect(result.positions[1]).toEqual({ tokenIndex: 1, text: 'chào', start: 4, end: 8 });
  });

  test('Rule 5: Chinese then latin_word get a space', () => {
    const result = jsAssembleWithSpacing([
      seg('không', 'chinese_word', 0),
      seg('VIP', 'latin_word', 1),
    ]);
    expect(result.translatedText).toBe('không VIP');
    expect(result.positions[1].start).toBe(6); // 5 chars + 1 space
  });

  test('Rule 6: latin_word then Chinese get a space', () => {
    const result = jsAssembleWithSpacing([
      seg('VIP', 'latin_word', 0),
      seg('không', 'chinese_word', 1),
    ]);
    expect(result.translatedText).toBe('VIP không');
    expect(result.positions[1].start).toBe(4);
  });

  test('Rule 7: Chinese then number gets a space', () => {
    const result = jsAssembleWithSpacing([
      seg('cổ phần', 'chinese_char', 0),
      seg('15%', 'number', 1),
    ]);
    expect(result.translatedText).toBe('cổ phần 15%');
  });

  test('Rule 8: number then Chinese gets a space', () => {
    const result = jsAssembleWithSpacing([
      seg('15%', 'number', 0),
      seg('cổ phần', 'chinese_char', 1),
    ]);
    expect(result.translatedText).toBe('15% cổ phần');
  });

  test('Rule 9: Chinese then unknown gets a space', () => {
    const result = jsAssembleWithSpacing([seg('xin', 'chinese_char', 0), seg('の', 'unknown', 1)]);
    expect(result.translatedText).toBe('xin の');
  });

  test('Rule 10: unknown then Chinese gets a space', () => {
    const result = jsAssembleWithSpacing([seg('の', 'unknown', 0), seg('xin', 'chinese_char', 1)]);
    expect(result.translatedText).toBe('の xin');
  });

  test('Rule 11: Chinese then punctuation-typed foreign letter gets a space', () => {
    const result = jsAssembleWithSpacing([
      seg('Vu', 'chinese_char', 0),
      seg('α', 'punctuation', 1),
    ]);
    expect(result.translatedText).toBe('Vu α');
  });

  test('latin → latin: no space', () => {
    const result = jsAssembleWithSpacing([
      seg('hello', 'latin_word', 0),
      seg('world', 'latin_word', 1),
    ]);
    expect(result.translatedText).toBe('helloworld');
    expect(result.positions[1].start).toBe(5);
  });

  test('position tracking: Chinese + Chinese + punctuation', () => {
    const result = jsAssembleWithSpacing([
      seg('xin', 'chinese_char', 0),
      seg('chào', 'chinese_char', 1),
      seg('.', 'punctuation', 2),
    ]);
    // "xin" + " " + "chào" + "."
    expect(result.translatedText).toBe('xin chào.');
    expect(result.positions[0]).toEqual({ tokenIndex: 0, text: 'xin', start: 0, end: 3 });
    expect(result.positions[1]).toEqual({ tokenIndex: 1, text: 'chào', start: 4, end: 8 });
    expect(result.positions[2]).toEqual({ tokenIndex: 2, text: '.', start: 8, end: 9 });
  });

  test('token indices are preserved in position entries', () => {
    const result = jsAssembleWithSpacing([
      seg('xin', 'chinese_char', 5),
      seg('chào', 'chinese_char', 12),
    ]);
    expect(result.positions[0].tokenIndex).toBe(5);
    expect(result.positions[1].tokenIndex).toBe(12);
  });

  test('position tracking: space counts as 1 char for next segment start', () => {
    const result = jsAssembleWithSpacing([
      seg('a', 'chinese_char', 0), // end=1, space inserted → currentPos=2
      seg('b', 'chinese_char', 1), // start=2, end=3, space inserted → currentPos=4
      seg('c', 'chinese_char', 2), // start=4, end=5
    ]);
    expect(result.translatedText).toBe('a b c');
    expect(result.positions[0].start).toBe(0);
    expect(result.positions[0].end).toBe(1);
    expect(result.positions[1].start).toBe(2);
    expect(result.positions[1].end).toBe(3);
    expect(result.positions[2].start).toBe(4);
    expect(result.positions[2].end).toBe(5);
  });

  test('Rule 2: Chinese + bracket punctuation gets space', () => {
    const result = jsAssembleWithSpacing([
      seg('xin', 'chinese_char', 0),
      seg('[A]', 'punctuation', 1),
    ]);
    expect(result.translatedText).toBe('xin [A]');
  });

  test('Rule 3: Chinese + digit-starting punctuation gets space', () => {
    const result = jsAssembleWithSpacing([
      seg('đạo', 'chinese_char', 0),
      seg('1/2', 'punctuation', 1),
    ]);
    expect(result.translatedText).toBe('đạo 1/2');
  });

  test('Rule 4: closing punctuation then Chinese gets space; opening quote does not', () => {
    const closing = jsAssembleWithSpacing([
      seg('.', 'punctuation', 0),
      seg('xin', 'chinese_char', 1),
    ]);
    expect(closing.translatedText).toBe('. xin');

    const openingQuote = jsAssembleWithSpacing([
      seg('"', 'punctuation', 0),
      seg('xin', 'chinese_char', 1),
    ]);
    expect(openingQuote.translatedText).toBe('"xin');

    const openingParen = jsAssembleWithSpacing([
      seg('(', 'punctuation', 0),
      seg('xin', 'chinese_char', 1),
    ]);
    expect(openingParen.translatedText).toBe('(xin');
  });
});

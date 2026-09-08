/**
 * Characterization tests for `needsSpaceCharOnly()` — the character-only
 * mode spacing decision, extracted verbatim (no behavior change) from
 * `TranslationEngine.js`'s `translateWithCharactersOnly()` inline block.
 *
 * NOT a parity test against `needsSpace()` (WasmTextAssembler.js /
 * text_assembly.rs) — that function decides from already-translated segment
 * text, this one decides from the original (untranslated) token stream. See
 * `needsSpaceCharOnly()`'s own doc comment and
 * `src/utils/__tests__/TranslationEngine.textAssembly.test.js` for the
 * separate three-way spacing-rule contract this codebase maintains.
 */

import { needsSpaceCharOnly } from '../text/CharOnlySpacing';

function tok(type, value = '') {
  return { type, value };
}

describe('needsSpaceCharOnly()', () => {
  it('returns false when there is no next token', () => {
    expect(needsSpaceCharOnly(tok('chinese_char'), null, '', false)).toBe(false);
  });

  describe('chinese_char → next', () => {
    it('spaces before chinese_char, latin_word, and number content', () => {
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('chinese_char'), '', false)).toBe(true);
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('latin_word'), '', false)).toBe(true);
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('number'), '', false)).toBe(true);
    });

    it('spaces before opening-element punctuation', () => {
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('punctuation', '('), '', false)).toBe(
        true
      );
    });

    it('spaces before a bare foreign letter typed as punctuation', () => {
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('punctuation', 'α'), '', false)).toBe(
        true
      );
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('punctuation', 'é'), '', false)).toBe(
        true
      );
    });

    it('does not space before ordinary punctuation or whitespace', () => {
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('punctuation', '。'), '', false)).toBe(
        false
      );
      expect(needsSpaceCharOnly(tok('chinese_char'), tok('whitespace', ' '), '', false)).toBe(
        false
      );
    });
  });

  describe('number → chinese_char', () => {
    it('spaces before a following chinese_char', () => {
      expect(needsSpaceCharOnly(tok('number'), tok('chinese_char'), '', false)).toBe(true);
    });

    it('does not space before non-chinese_char', () => {
      expect(needsSpaceCharOnly(tok('number'), tok('number'), '', false)).toBe(false);
      expect(needsSpaceCharOnly(tok('number'), tok('punctuation', '.'), '', false)).toBe(false);
    });
  });

  describe('latin_word → chinese_char', () => {
    it('spaces before a following chinese_char', () => {
      expect(needsSpaceCharOnly(tok('latin_word'), tok('chinese_char'), '', false)).toBe(true);
    });

    it('does not space before non-chinese_char', () => {
      expect(needsSpaceCharOnly(tok('latin_word'), tok('latin_word'), '', false)).toBe(false);
    });
  });

  describe('punctuation → next', () => {
    it('spaces after a closing quote before non-whitespace content, unless buffer already ends in a space', () => {
      expect(needsSpaceCharOnly(tok('punctuation'), tok('chinese_char'), '”', false)).toBe(true);
      expect(needsSpaceCharOnly(tok('punctuation'), tok('chinese_char'), '”', true)).toBe(false);
    });

    it('does not space after a closing quote before whitespace', () => {
      expect(needsSpaceCharOnly(tok('punctuation'), tok('whitespace', ' '), '”', false)).toBe(
        false
      );
    });

    it('spaces before a following opening-element punctuation, unless buffer already ends in a space', () => {
      expect(needsSpaceCharOnly(tok('punctuation'), tok('punctuation', '('), '。', false)).toBe(
        true
      );
      expect(needsSpaceCharOnly(tok('punctuation'), tok('punctuation', '('), '。', true)).toBe(
        false
      );
    });

    it('does not space when neither condition applies', () => {
      expect(needsSpaceCharOnly(tok('punctuation'), tok('chinese_char'), '。', false)).toBe(false);
    });
  });

  describe('unhandled current-token types', () => {
    it('returns false for whitespace and unknown token types', () => {
      expect(needsSpaceCharOnly(tok('whitespace'), tok('chinese_char'), '', false)).toBe(false);
      expect(needsSpaceCharOnly(tok('unknown'), tok('chinese_char'), '', false)).toBe(false);
    });
  });
});

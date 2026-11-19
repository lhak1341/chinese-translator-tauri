/**
 * Tests for PunctuationProcessor
 *
 * Every translation passes through punctuation processing on its way to the UI.
 * A prior session produced a full debug document from a spacing bug
 * (git show be492346:docs/code-review/PUNCTUATION_SPACING_DEBUG_2026-02-02.md). These tests guard those cases.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { PunctuationProcessor } from '../text/PunctuationProcessor';
import { QUOTE_TYPES } from '../text/QuoteProcessor';

describe('PunctuationProcessor', () => {
  let processor: PunctuationProcessor;

  beforeEach(() => {
    processor = new PunctuationProcessor();
  });

  // -------------------------------------------------------------------------
  // processSequence — special patterns
  // -------------------------------------------------------------------------

  describe('processSequence — special patterns', () => {
    test('colon followed by double quote gets a space: :→ : "', () => {
      const result = processor.processSequence(':"');
      expect(result).toBe(': "');
    });

    test('colon followed by curly open quote', () => {
      const result = processor.processSequence(`:${QUOTE_TYPES.CURLY_OPEN_DOUBLE}`);
      expect(result).toContain(': ');
    });

    test('period followed by double quote gets a space: ." → . "', () => {
      const result = processor.processSequence('."');
      expect(result).toBe('. "');
    });

    // These three tests exercise the SPECIAL_PATTERNS direct-regex path in PunctuationProcessor
    // (lines 112-116: /([.。])/g, /([?？])/g, /([!！])/g each followed by [[（【(]).
    // They do NOT exercise openingQuotePattern — per CLAUDE.md, that regex matches opening
    // quote characters but NOT literal brackets like `[` or `(`.
    test('period followed by opening bracket: .[ → . [', () => {
      const result = processor.processSequence('.[');
      expect(result).toBe('. [');
    });

    test('question mark followed by opening bracket: ?[ → ? [', () => {
      const result = processor.processSequence('?[');
      expect(result).toBe('? [');
    });

    test('exclamation followed by opening bracket: ![ → ! [', () => {
      const result = processor.processSequence('![');
      expect(result).toBe('! [');
    });

    test('Chinese period followed by opening bracket: 。[ → 。 [', () => {
      const result = processor.processSequence('。[');
      expect(result).toBe('。 [');
    });

    test('colon followed by opening bracket: :( → : (', () => {
      const result = processor.processSequence(':(');
      expect(result).toBe(': (');
    });
  });

  // -------------------------------------------------------------------------
  // processSequence — trailing space
  // -------------------------------------------------------------------------

  describe('processSequence — trailing space', () => {
    test('comma with hasNextChunk=true gets trailing space', () => {
      const result = processor.processSequence(',', true);
      expect(result.endsWith(' ')).toBe(true);
    });

    test('period with hasNextChunk=true gets trailing space', () => {
      const result = processor.processSequence('.', true);
      expect(result.endsWith(' ')).toBe(true);
    });

    test('period with hasNextChunk=false does not get trailing space', () => {
      const result = processor.processSequence('.', false);
      expect(result).not.toMatch(/ $/);
    });

    test('opening bracket does not get trailing space (content follows bracket directly)', () => {
      const result = processor.processSequence('(', true);
      expect(result).not.toMatch(/ $/);
    });

    test('opening square bracket does not get trailing space', () => {
      const result = processor.processSequence('[', true);
      expect(result).not.toMatch(/ $/);
    });

    test('forward slash / does not get trailing space (division operator)', () => {
      const result = processor.processSequence('/', true);
      expect(result).not.toMatch(/ $/);
    });

    test('closing bracket ) with hasNextChunk=true gets trailing space', () => {
      const result = processor.processSequence(')', true);
      expect(result.endsWith(' ')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // processSequence — single opening quote
  // -------------------------------------------------------------------------

  describe('processSequence — single opening quote with hasNextChunk', () => {
    test('single double-quote gets space prepended when hasNextChunk=true', () => {
      const result = processor.processSequence('"', true);
      expect(result.startsWith(' ')).toBe(true);
    });

    test('single curly open double-quote gets space prepended', () => {
      const result = processor.processSequence(QUOTE_TYPES.CURLY_OPEN_DOUBLE, true);
      expect(result.startsWith(' ')).toBe(true);
    });

    test('single opening quote with hasNextChunk=false does not prepend space', () => {
      const result = processor.processSequence('"', false);
      expect(result).not.toMatch(/^ /);
    });
  });

  // -------------------------------------------------------------------------
  // processSequence — comma + opening quote combo
  // -------------------------------------------------------------------------

  describe('processSequence — comma + quote', () => {
    test('comma + double-quote inserts space between them: ," → , "', () => {
      const result = processor.processSequence(',"');
      expect(result).toContain(', ');
    });

    test('Chinese comma + double-quote inserts space', () => {
      const result = processor.processSequence('，"');
      expect(result).toContain('，');
      expect(result).toContain('"');
    });
  });

  // -------------------------------------------------------------------------
  // processSequence — empty input
  // -------------------------------------------------------------------------

  describe('processSequence — edge cases', () => {
    test('empty string returns empty string', () => {
      expect(processor.processSequence('')).toBe('');
    });

    test('already-spaced sequence is returned as-is', () => {
      const alreadySpaced = '. [';
      const result = processor.processSequence(alreadySpaced);
      expect(result).toBe(alreadySpaced);
    });
  });

  // -------------------------------------------------------------------------
  // hasOpeningElements
  // -------------------------------------------------------------------------

  describe('hasOpeningElements', () => {
    test('opening bracket detected', () => {
      expect(processor.hasOpeningElements('[')).toBe(true);
    });

    test('pure middle punctuation has no opening', () => {
      expect(processor.hasOpeningElements(',')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // startsWithClosingElement
  // -------------------------------------------------------------------------

  describe('startsWithClosingElement', () => {
    test('ASCII closing bracket detected', () => {
      expect(processor.startsWithClosingElement(')')).toBe(true);
    });

    test('CJK closing bracket detected', () => {
      expect(processor.startsWithClosingElement('》')).toBe(true);
    });

    test('angle closing quote detected', () => {
      expect(processor.startsWithClosingElement(QUOTE_TYPES.ANGLE_CLOSE_DOUBLE)).toBe(true);
    });

    test('curly closing double quote detected (regression: 」→" was previously missed)', () => {
      expect(processor.startsWithClosingElement(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe(true);
    });

    test("curly closing single quote detected (regression: 』→' was previously missed)", () => {
      expect(processor.startsWithClosingElement(QUOTE_TYPES.CURLY_CLOSE_SINGLE)).toBe(true);
    });

    test('opening quote is not a closing element', () => {
      expect(processor.startsWithClosingElement(QUOTE_TYPES.CURLY_OPEN_DOUBLE)).toBe(false);
    });

    test('pure middle punctuation is not a closing element', () => {
      expect(processor.startsWithClosingElement(',')).toBe(false);
    });

    test('empty string is not a closing element', () => {
      expect(processor.startsWithClosingElement('')).toBe(false);
    });

    test('only checks the first character', () => {
      expect(processor.startsWithClosingElement(')[')).toBe(true);
      expect(processor.startsWithClosingElement('[)')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isAlreadyProperlySpaced
  // -------------------------------------------------------------------------

  describe('isAlreadyProperlySpaced', () => {
    test('closing+middle no space is NOT already properly spaced', () => {
      expect(processor.isAlreadyProperlySpaced('],')).toBe(false);
    });

    test('empty string is not properly spaced (returns false)', () => {
      expect(processor.isAlreadyProperlySpaced('')).toBe(false);
    });

    test('plain comma is not properly spaced', () => {
      expect(processor.isAlreadyProperlySpaced(',')).toBe(false);
    });

    test('plain punctuation without spaces is not detected as already-spaced', () => {
      // Single middle punctuation has no spacing information
      expect(processor.isAlreadyProperlySpaced('.')).toBe(false);
      expect(processor.isAlreadyProperlySpaced('!')).toBe(false);
    });
  });
});

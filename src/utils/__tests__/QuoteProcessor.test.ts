/**
 * Tests for QuoteProcessor
 *
 * Covers quote classification, regex factory methods, and normalisation.
 */

import { describe, test, expect } from 'vitest';
import { QuoteProcessor, QUOTE_TYPES, QUOTE_CATEGORIES } from '../text/QuoteProcessor';

describe('QuoteProcessor — isOpeningQuote', () => {
  test('ASCII double-quote is an opening quote', () => {
    expect(QuoteProcessor.isOpeningQuote('"')).toBe(true);
  });

  test('curly open double-quote is an opening quote', () => {
    expect(QuoteProcessor.isOpeningQuote(QUOTE_TYPES.CURLY_OPEN_DOUBLE)).toBe(true);
  });

  test('curly open single-quote is an opening quote', () => {
    expect(QuoteProcessor.isOpeningQuote(QUOTE_TYPES.CURLY_OPEN_SINGLE)).toBe(true);
  });

  test('curly close double-quote is NOT an opening quote', () => {
    expect(QuoteProcessor.isOpeningQuote(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe(false);
  });

  test('regular letter is not an opening quote', () => {
    expect(QuoteProcessor.isOpeningQuote('a')).toBe(false);
  });
});

describe('QuoteProcessor — isClosingQuote', () => {
  test('curly close double-quote is a closing quote', () => {
    expect(QuoteProcessor.isClosingQuote(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe(true);
  });

  test('curly close single-quote is a closing quote', () => {
    expect(QuoteProcessor.isClosingQuote(QUOTE_TYPES.CURLY_CLOSE_SINGLE)).toBe(true);
  });

  test('ASCII double-quote is NOT a closing quote', () => {
    // Straight double-quote is classified as opening, not closing
    expect(QuoteProcessor.isClosingQuote('"')).toBe(false);
  });

  test('regular letter is not a closing quote', () => {
    expect(QuoteProcessor.isClosingQuote('z')).toBe(false);
  });
});

describe('QuoteProcessor — isQuote', () => {
  test('all QUOTE_TYPES values are recognised as quotes', () => {
    for (const q of Object.values(QUOTE_TYPES)) {
      expect(QuoteProcessor.isQuote(q)).toBe(true);
    }
  });

  test('non-quote characters are not recognised', () => {
    for (const ch of ['a', '1', '.', ',', '(', '[', '中']) {
      expect(QuoteProcessor.isQuote(ch)).toBe(false);
    }
  });
});

describe('QuoteProcessor — createOpeningQuoteRegex', () => {
  test('regex matches ASCII double-quote', () => {
    const re = QuoteProcessor.createOpeningQuoteRegex();
    expect(re.test('"')).toBe(true);
  });

  test('regex matches curly open double-quote', () => {
    const re = QuoteProcessor.createOpeningQuoteRegex();
    expect(re.test(QUOTE_TYPES.CURLY_OPEN_DOUBLE)).toBe(true);
  });

  test('regex does not match closing quote', () => {
    const re = QuoteProcessor.createOpeningQuoteRegex();
    expect(re.test(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe(false);
  });

  test('regex does not match non-quote characters', () => {
    const re = QuoteProcessor.createOpeningQuoteRegex();
    expect(re.test('a')).toBe(false);
  });
});

describe('QuoteProcessor — createColonQuoteRegex', () => {
  test('matches colon followed by double-quote', () => {
    const re = QuoteProcessor.createColonQuoteRegex();
    expect(re.test(':"')).toBe(true);
  });

  test('has global flag (for repeated replace calls)', () => {
    const re = QuoteProcessor.createColonQuoteRegex();
    expect(re.flags).toContain('g');
  });
});

describe('QuoteProcessor — createPeriodQuoteRegex', () => {
  test('matches period followed by double-quote', () => {
    const re = QuoteProcessor.createPeriodQuoteRegex();
    re.lastIndex = 0;
    expect(re.test('."')).toBe(true);
  });

  test('matches Chinese period followed by opening quote', () => {
    const re = QuoteProcessor.createPeriodQuoteRegex();
    re.lastIndex = 0;
    expect(re.test(`。${QUOTE_TYPES.CURLY_OPEN_DOUBLE}`)).toBe(true);
  });

  test('does not match period followed by closing quote', () => {
    const re = QuoteProcessor.createPeriodQuoteRegex();
    re.lastIndex = 0;
    expect(re.test(`。${QUOTE_TYPES.CURLY_CLOSE_DOUBLE}`)).toBe(false);
  });
});

describe('QUOTE_CATEGORIES', () => {
  test('OPENING contains 5 quote types', () => {
    expect(QUOTE_CATEGORIES.OPENING).toHaveLength(5);
  });

  test('CLOSING contains 4 quote types', () => {
    expect(QUOTE_CATEGORIES.CLOSING).toHaveLength(4);
  });

  test('ALL contains 10 quote types', () => {
    expect(QUOTE_CATEGORIES.ALL).toHaveLength(10);
  });

  test('OPENING and CLOSING are disjoint', () => {
    const openSet = new Set(QUOTE_CATEGORIES.OPENING);
    const closingHasOverlap = QUOTE_CATEGORIES.CLOSING.some((q) => openSet.has(q));
    expect(closingHasOverlap).toBe(false);
  });
});

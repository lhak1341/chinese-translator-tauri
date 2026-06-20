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

describe('QuoteProcessor — getQuoteType', () => {
  test('straight double-quote → straight_double', () => {
    expect(QuoteProcessor.getQuoteType('"')).toBe('straight_double');
  });

  test('straight single-quote → straight_single', () => {
    expect(QuoteProcessor.getQuoteType("'")).toBe('straight_single');
  });

  test('curly open double → curly_open_double', () => {
    expect(QuoteProcessor.getQuoteType(QUOTE_TYPES.CURLY_OPEN_DOUBLE)).toBe('curly_open_double');
  });

  test('curly close double → curly_close_double', () => {
    expect(QuoteProcessor.getQuoteType(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe('curly_close_double');
  });

  test('curly open single → curly_open_single', () => {
    expect(QuoteProcessor.getQuoteType(QUOTE_TYPES.CURLY_OPEN_SINGLE)).toBe('curly_open_single');
  });

  test('curly close single → curly_close_single', () => {
    expect(QuoteProcessor.getQuoteType(QUOTE_TYPES.CURLY_CLOSE_SINGLE)).toBe('curly_close_single');
  });

  test('non-quote → not_quote', () => {
    expect(QuoteProcessor.getQuoteType('x')).toBe('not_quote');
  });
});

describe('QuoteProcessor — getQuoteInfo', () => {
  test('returns correct unicode code point string', () => {
    const info = QuoteProcessor.getQuoteInfo('"');
    expect(info.unicode).toBe('U+0022');
  });

  test('isQuote flag is true for quote chars', () => {
    expect(QuoteProcessor.getQuoteInfo('"').isQuote).toBe(true);
  });

  test('isQuote flag is false for non-quote chars', () => {
    expect(QuoteProcessor.getQuoteInfo('a').isQuote).toBe(false);
  });

  test('isOpening and isClosing are mutually exclusive for curly quotes', () => {
    const openInfo = QuoteProcessor.getQuoteInfo(QUOTE_TYPES.CURLY_OPEN_DOUBLE);
    const closeInfo = QuoteProcessor.getQuoteInfo(QUOTE_TYPES.CURLY_CLOSE_DOUBLE);
    expect(openInfo.isOpening).toBe(true);
    expect(openInfo.isClosing).toBe(false);
    expect(closeInfo.isOpening).toBe(false);
    expect(closeInfo.isClosing).toBe(true);
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

describe('QuoteProcessor — createClosingQuoteRegex', () => {
  test('regex matches curly close double-quote', () => {
    const re = QuoteProcessor.createClosingQuoteRegex();
    expect(re.test(QUOTE_TYPES.CURLY_CLOSE_DOUBLE)).toBe(true);
  });

  test('regex matches curly close single-quote', () => {
    const re = QuoteProcessor.createClosingQuoteRegex();
    expect(re.test(QUOTE_TYPES.CURLY_CLOSE_SINGLE)).toBe(true);
  });

  test('regex does not match ASCII double-quote', () => {
    const re = QuoteProcessor.createClosingQuoteRegex();
    expect(re.test('"')).toBe(false);
  });
});

describe('QuoteProcessor — createAllQuotesRegex', () => {
  test('matches every QUOTE_TYPES value', () => {
    const re = QuoteProcessor.createAllQuotesRegex();
    for (const q of Object.values(QUOTE_TYPES)) {
      expect(re.test(q)).toBe(true);
    }
  });

  test('does not match non-quote characters', () => {
    const re = QuoteProcessor.createAllQuotesRegex();
    expect(re.test('中')).toBe(false);
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

describe('QuoteProcessor — normalizeQuotes', () => {
  test('straight to curly: replaces ASCII double-quote with curly open', () => {
    const result = QuoteProcessor.normalizeQuotes('say "hello"', 'curly');
    expect(result).toContain(QUOTE_TYPES.CURLY_OPEN_DOUBLE);
    expect(result).not.toContain('"');
  });

  test('curly to straight: replaces curly double-quotes with ASCII', () => {
    const text = `${QUOTE_TYPES.CURLY_OPEN_DOUBLE}hello${QUOTE_TYPES.CURLY_CLOSE_DOUBLE}`;
    const result = QuoteProcessor.normalizeQuotes(text, 'straight');
    expect(result).not.toContain(QUOTE_TYPES.CURLY_OPEN_DOUBLE);
    expect(result).not.toContain(QUOTE_TYPES.CURLY_CLOSE_DOUBLE);
    expect(result).toContain('"');
  });

  test('curly to straight: replaces curly single-quotes', () => {
    const text = `${QUOTE_TYPES.CURLY_OPEN_SINGLE}hi${QUOTE_TYPES.CURLY_CLOSE_SINGLE}`;
    const result = QuoteProcessor.normalizeQuotes(text, 'straight');
    expect(result).toContain("'");
  });

  test('default target is curly', () => {
    const result = QuoteProcessor.normalizeQuotes('say "hello"');
    expect(result).toContain(QUOTE_TYPES.CURLY_OPEN_DOUBLE);
  });

  test('normalizing text with no quotes is a no-op', () => {
    expect(QuoteProcessor.normalizeQuotes('no quotes here', 'curly')).toBe('no quotes here');
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

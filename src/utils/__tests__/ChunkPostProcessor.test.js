/**
 * Direct unit tests for ChunkPostProcessor.
 *
 * Seam created in Session 68 (extracted from TextChunker). Tests exercise the class
 * with TextChunk[] fixtures — no TranslationEngine required.
 *
 * Regression coverage for two recent punctuation bugs:
 *   06a5b50 — »« adjacency: processSequence must insert space between closing+opening angle quotes
 *   6dd1475 — «»<> as quote chars: comma must not get trailing space when followed by angle quotes
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { ChunkPostProcessor } from '../text/ChunkPostProcessor.js';
import { QUOTE_TYPES } from '../text/QuoteProcessor.js';

/** @param {{content?: string, punctuation?: string, startIndex?: number, lineBreaks?: string, startedBy?: string}} overrides */
function makeChunk(overrides = {}) {
  return {
    content: '',
    translated: null,
    translatedContent: null,
    punctuation: '',
    translatedPunctuation: '',
    openingPunctuation: '',
    lineBreaks: '',
    startedBy: '',
    semanticIndex: undefined,
    ...overrides,
  };
}

const PUNCT_DICT = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '：': ':',
  '《': QUOTE_TYPES.ANGLE_OPEN_DOUBLE, // «
  '》': QUOTE_TYPES.ANGLE_CLOSE_DOUBLE, // »
  '〈': QUOTE_TYPES.ANGLE_OPEN_SINGLE, // <
  '〉': QUOTE_TYPES.ANGLE_CLOSE_SINGLE, // >
};

// ── translatePunctuationNormally ─────────────────────────────────────────────

describe('ChunkPostProcessor.translatePunctuationNormally', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('basic dict translation — Chinese punctuation → Latin', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', punctuation: '，' })];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('unknown punctuation falls through unchanged', () => {
    const chunks = [makeChunk({ content: 'a', translated: 'a', punctuation: '~' })];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe('~');
  });

  test('content chars in dict → translatedContent set', () => {
    const chunks = [makeChunk({ content: '，', punctuation: '' })];
    cpp.translatePunctuationNormally(chunks, { '，': ',' });
    expect(chunks[0].translatedContent).toBe(',');
  });

  test('translatedPunctuation already set → translate chars within it, preserve spacing', () => {
    const chunks = [makeChunk({ content: 'a', punctuation: '，', translatedPunctuation: '， ' })];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    // Existing spacing preserved; char translated in-place
    expect(chunks[0].translatedPunctuation).toBe(', ');
  });

  test('comma + hasNextChunk with content → space appended after comma', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(', ');
  });

  test('comma + no next chunk → no trailing space', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', punctuation: '，' })];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('comma + next chunk empty content → no trailing space', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  // Regression: 6dd1475 — «»<> must be treated as quote chars
  test('regression 6dd1475: comma translatedPunctuation ending with » → no trailing space', () => {
    // Before fix: isQuote('»') was false → space incorrectly appended → ',» '
    // After fix:  isQuote('»') is true  → no space                    → ',»'
    const chunks = [
      makeChunk({
        content: '说',
        translated: 'nói',
        punctuation: '，',
        translatedPunctuation: ',' + QUOTE_TYPES.ANGLE_CLOSE_DOUBLE, // ,»
      }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(',' + QUOTE_TYPES.ANGLE_CLOSE_DOUBLE);
  });

  test('regression 6dd1475: next chunk punctuation has » (closing) → no space after comma', () => {
    // nextChunkHasClosingQuote check: before fix isClosingQuote('»') was false
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời', punctuation: QUOTE_TYPES.ANGLE_CLOSE_DOUBLE }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('comma + bracket sequence → comma+space+bracket', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    // Set up comma+bracket in translatedPunctuation directly
    chunks[0].translatedPunctuation = ',[';
    chunks[0].punctuation = '，[';
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe(', [');
  });

  test('no punctuation field → chunk unchanged', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói' })];
    cpp.translatePunctuationNormally(chunks, PUNCT_DICT);
    expect(chunks[0].translatedPunctuation).toBe('');
  });
});

// ── fixAngleQuotePositioning ─────────────────────────────────────────────────

describe('ChunkPostProcessor.fixAngleQuotePositioning', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('〈-only empty chunk → openingPunctuation set to < on next chunk', () => {
    const chunks = [
      makeChunk({ content: '', punctuation: '〈', translatedPunctuation: '<' }),
      makeChunk({ content: '说', translated: 'nói' }),
    ];
    cpp.fixAngleQuotePositioning(chunks);
    expect(chunks[0].punctuation).toBe('');
    expect(chunks[0].translatedPunctuation).toBe('');
    expect(chunks[1].openingPunctuation).toBe('<');
  });

  test('non-empty chunk with opening quote → NOT moved (chunk has content)', () => {
    const chunks = [
      makeChunk({ content: '说', punctuation: '《', translatedPunctuation: '«' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.fixAngleQuotePositioning(chunks);
    // chunk has content → condition `!chunk.content.trim()` is false → no move
    expect(chunks[0].punctuation).toBe('《');
    expect(chunks[1].openingPunctuation).toBe('');
  });

  test('last chunk with opening quote → no next chunk to move to, no crash', () => {
    const chunks = [makeChunk({ content: '', punctuation: '《', translatedPunctuation: '«' })];
    expect(() => cpp.fixAngleQuotePositioning(chunks)).not.toThrow();
  });
});

// ── reconstructText ──────────────────────────────────────────────────────────

describe('ChunkPostProcessor.reconstructText', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('single chunk — content only', () => {
    const chunks = [makeChunk({ content: 'xin chào', translated: 'xin chào' })];
    expect(cpp.reconstructText(chunks)).toBe('xin chào');
  });

  test('content + punctuation after', () => {
    const chunks = [
      makeChunk({
        content: '说',
        translated: 'nói',
        punctuation: '，',
        translatedPunctuation: ',',
      }),
    ];
    expect(cpp.reconstructText(chunks)).toBe('nói,');
  });

  test('multiple chunks concatenated', () => {
    const chunks = [
      makeChunk({
        content: '说',
        translated: 'nói',
        punctuation: '，',
        translatedPunctuation: ', ',
      }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    expect(cpp.reconstructText(chunks)).toBe('nói, lời');
  });

  test('openingPunctuation on chunk > 0 gets space prefix', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', translatedPunctuation: '»' }),
      makeChunk({ content: '话', translated: 'lời', openingPunctuation: '«' }),
    ];
    const result = cpp.reconstructText(chunks);
    // «lời chunk: openingPunctuation '«' → gets ' «' prefix (space added because index>0)
    expect(result).toContain(' «lời');
  });

  test('first chunk openingPunctuation → no space prefix', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', openingPunctuation: '«' })];
    const result = cpp.reconstructText(chunks);
    expect(result.startsWith('«')).toBe(true);
  });

  test('line breaks preserved', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', lineBreaks: '\n' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    expect(cpp.reconstructText(chunks)).toBe('nói\nlời');
  });

  test('empty content chunk with punctuation only', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói' }),
      makeChunk({ content: '', punctuation: '。', translatedPunctuation: '.' }),
    ];
    expect(cpp.reconstructText(chunks)).toBe('nói.');
  });

  // Regression: 06a5b50 — space between »« (closing+opening angle quotes)
  test('regression 06a5b50: »« in translatedPunctuation → space between them', () => {
    // Before fix: processSequence('»«') returned '»«' with no space
    // After fix: returns '» «'
    const closeQ = QUOTE_TYPES.ANGLE_CLOSE_DOUBLE; // »
    const openQ = QUOTE_TYPES.ANGLE_OPEN_DOUBLE; // «
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', translatedPunctuation: closeQ + openQ }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    const result = cpp.reconstructText(chunks);
    // Must have space between » and «
    expect(result).toContain(closeQ + ' ' + openQ);
  });

  test('reconstructText does NOT NFC-normalize — passes content through as-is', () => {
    // Only reconstructTextWithSegments normalizes. reconstructText is the fast path.
    const nfd = 'ma\u0300u'; // NFD: a + U+0300 combining grave = 'à'
    const chunks = [makeChunk({ content: 'x', translated: nfd })];
    expect(cpp.reconstructText(chunks)).toBe(nfd);
  });
});

// ── reconstructTextWithSegments ──────────────────────────────────────────────

describe('ChunkPostProcessor.reconstructTextWithSegments', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('empty chunks array → {text: "", segments: []}', () => {
    const result = cpp.reconstructTextWithSegments([]);
    expect(result.text).toBe('');
    expect(result.segments).toEqual([]);
  });

  test('untranslated chunk (no semanticIndex) → type=untranslated segment', () => {
    const chunks = [makeChunk({ content: 'ABC', translated: 'ABC' })];
    const { text, segments } = cpp.reconstructTextWithSegments(chunks);
    expect(text).toBe('ABC');
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('untranslated');
    expect(segments[0].isClickable).toBe(false);
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(3);
  });

  test('semantic chunk (has semanticIndex) → type=semantic segment with unitIndex', () => {
    const semanticArrays = {
      original: ['说'],
      translated: ['nói'],
      metadata: [{ source: 'characters' }],
    };
    const chunks = [makeChunk({ content: '说', translated: 'nói', semanticIndex: 0 })];
    const { text, segments } = cpp.reconstructTextWithSegments(chunks, semanticArrays);
    expect(text).toBe('nói');
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('semantic');
    expect(segments[0].isClickable).toBe(true);
    expect(segments[0].unitIndex).toBe(0);
    expect(segments[0].originalText).toBe('说');
    expect(segments[0].translatedText).toBe('nói');
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(3); // 'nói' is 3 chars
  });

  test('punctuation → type=punctuation segment, isClickable=false', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', translatedPunctuation: '.' })];
    const { segments } = cpp.reconstructTextWithSegments(chunks);
    const punctSeg = segments.find((s) => s.type === 'punctuation');
    expect(punctSeg).toBeDefined();
    expect(punctSeg.isClickable).toBe(false);
    expect(punctSeg.text).toBe('.');
  });

  test('positions accumulate correctly across multiple chunks', () => {
    const chunks = [
      makeChunk({ content: 'AB', translated: 'AB' }),
      makeChunk({ content: 'CD', translated: 'CD' }),
    ];
    const { text, segments } = cpp.reconstructTextWithSegments(chunks);
    expect(text).toBe('ABCD');
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(2);
    expect(segments[1].start).toBe(2);
    expect(segments[1].end).toBe(4);
  });

  test('line break → type=linebreak segment', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', lineBreaks: '\n' })];
    const { segments } = cpp.reconstructTextWithSegments(chunks);
    const lbSeg = segments.find((s) => s.type === 'linebreak');
    expect(lbSeg).toBeDefined();
    expect(lbSeg.text).toBe('\n');
  });

  test('opening punctuation → type=punctuation segment before content', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', openingPunctuation: '«' })];
    const { segments } = cpp.reconstructTextWithSegments(chunks);
    // First segment should be the opening punctuation
    expect(segments[0].type).toBe('punctuation');
    expect(segments[0].text).toBe('«');
    expect(segments[0].start).toBe(0);
    // Content segment follows
    expect(segments[1].type).toBe('untranslated');
    expect(segments[1].start).toBe(1); // after '«'
  });
});

// ── translatePunctuation (integrated) ────────────────────────────────────────

describe('ChunkPostProcessor.translatePunctuation (integrated)', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('translates dict chars AND fixes angle quote positioning in one call', () => {
    const chunks = [
      makeChunk({ content: '', punctuation: '《' }),
      makeChunk({ content: '说', translated: 'nói' }),
    ];
    cpp.translatePunctuation(chunks, PUNCT_DICT);
    // translatePunctuationNormally: 《 → «
    // fixAngleQuotePositioning: empty chunk with « → move to next
    expect(chunks[0].translatedPunctuation).toBe('');
    expect(chunks[1].openingPunctuation).toBe(QUOTE_TYPES.ANGLE_OPEN_DOUBLE);
  });

  test('non-quote punctuation unchanged by fixAngleQuotePositioning', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuation(chunks, PUNCT_DICT);
    // comma + next chunk with content → space appended (correct behavior)
    expect(chunks[0].translatedPunctuation).toBe(', ');
    expect(chunks[1].openingPunctuation).toBe('');
  });
});

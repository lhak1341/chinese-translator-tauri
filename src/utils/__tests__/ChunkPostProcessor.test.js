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
import fs from 'node:fs';
import { describe, test, expect, beforeEach } from 'vitest';
import { ChunkPostProcessor } from '../text/ChunkPostProcessor.js';
import { QUOTE_TYPES } from '../text/QuoteProcessor.js';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';

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

/** The punctuation dictionary `dict` as the text translator the engine hands to ChunkPostProcessor. */
async function punctuationTranslator(dict) {
  const manager = new DictionaryManager();
  await manager.loadDictionaries({ punctuation: dict });
  return (text) => manager.translatePunctuationText(text);
}

const PUNCT = await punctuationTranslator(PUNCT_DICT);

// ── translatePunctuationNormally ─────────────────────────────────────────────

describe('ChunkPostProcessor.translatePunctuationNormally', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  test('basic dict translation — Chinese punctuation → Latin', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', punctuation: '，' })];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('unknown punctuation falls through unchanged', () => {
    const chunks = [makeChunk({ content: 'a', translated: 'a', punctuation: '~' })];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe('~');
  });

  test('content chars in dict → translatedContent set', async () => {
    const chunks = [makeChunk({ content: '，', punctuation: '' })];
    cpp.translatePunctuationNormally(chunks, await punctuationTranslator({ '，': ',' }));
    expect(chunks[0].translatedContent).toBe(',');
  });

  test('a preset translatedPunctuation is ignored: the result comes from punctuation', () => {
    const chunks = [makeChunk({ content: 'a', punctuation: '，', translatedPunctuation: 'stale' })];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('comma + hasNextChunk with content → space appended after comma', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(', ');
  });

  test('comma + no next chunk → no trailing space', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói', punctuation: '，' })];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('comma + next chunk empty content → no trailing space', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  // The tokenizer splits "2,700" into number, ",", number, so the comma reaches here as its own
  // punctuation between two digit-edged chunks. A thousands separator takes no space ("2,700"),
  // while a list comma does ("1, 2"), so the rule keys on the SOURCE comma: ASCII "," with a digit
  // on both sides. The full-width "，" is always a clause comma.
  test('ASCII comma between digits (thousands separator) → no trailing space', () => {
    const chunks = [
      makeChunk({ content: '说2', translated: 'thuyết 2', punctuation: ',' }),
      makeChunk({ content: '700', translated: null }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('full-width comma between digits → still gets a trailing space', () => {
    const chunks = [
      makeChunk({ content: '说2', translated: 'thuyết 2', punctuation: '，' }),
      makeChunk({ content: '700', translated: null }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(', ');
  });

  test('ASCII comma with a non-digit on either side → still gets a trailing space', () => {
    const before = [
      makeChunk({ content: '说', translated: 'nói', punctuation: ',' }),
      makeChunk({ content: '700', translated: null }),
    ];
    cpp.translatePunctuationNormally(before, PUNCT);
    expect(before[0].translatedPunctuation).toBe(', ');

    const after = [
      makeChunk({ content: '说2', translated: 'thuyết 2', punctuation: ',' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuationNormally(after, PUNCT);
    expect(after[0].translatedPunctuation).toBe(', ');
  });

  // Regression: 6dd1475 — «»<> must be treated as quote chars
  test('regression 6dd1475: comma translatedPunctuation ending with » → no trailing space', () => {
    // Before fix: isQuote('»') was false → space incorrectly appended → ',» '
    // After fix:  isQuote('»') is true  → no space                    → ',»'
    const chunks = [
      makeChunk({
        content: '说',
        translated: 'nói',
        punctuation: '，' + QUOTE_TYPES.ANGLE_CLOSE_DOUBLE, // ，»
      }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',' + QUOTE_TYPES.ANGLE_CLOSE_DOUBLE);
  });

  test('regression 6dd1475: next chunk punctuation has » (closing) → no space after comma', () => {
    // nextChunkHasClosingQuote check: before fix isClosingQuote('»') was false
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời', punctuation: QUOTE_TYPES.ANGLE_CLOSE_DOUBLE }),
    ];
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');
  });

  test('comma + bracket sequence → comma+space+bracket', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    chunks[0].punctuation = '，[';
    cpp.translatePunctuationNormally(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(', [');
  });

  test('no punctuation field → chunk unchanged', () => {
    const chunks = [makeChunk({ content: '说', translated: 'nói' })];
    cpp.translatePunctuationNormally(chunks, PUNCT);
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

  test('no chunks → empty string', () => {
    expect(cpp.reconstructText([])).toBe('');
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

  // Regression 2026-09-07: startsWithClosingElement didn't recognize curly closing quotes
  // (」→" and 』→' are common production punctuation-dict mappings for closing dialogue),
  // so a wrong space was inserted before them — same bug shape as 06a5b50, different chars.
  test('regression 2026-09-07: curly closing quote gets no space before it', () => {
    const closeQ = QUOTE_TYPES.CURLY_CLOSE_DOUBLE; // " (from 」)
    const openQ = QUOTE_TYPES.ANGLE_OPEN_DOUBLE; // « (from 《)
    const chunks = [
      makeChunk({ content: '说', translated: 'nói nói', translatedPunctuation: closeQ + openQ }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    const result = cpp.reconstructText(chunks);
    // Must NOT have a space before the closing quote itself...
    expect(result).not.toContain(' ' + closeQ);
    // ...but the existing closing+opening spacing rule still applies between " and «.
    expect(result).toContain(closeQ + ' ' + openQ);
  });

  test('regression 2026-09-07: curly closing single quote (』) gets no space before it', () => {
    // A lone closing quote with no following opening element never reaches the
    // startsWithClosingElement check (hasOpeningElements gates it) — pair it with
    // an opening element, same shape as the double-quote case above, to actually
    // exercise the fix.
    const closeQ = QUOTE_TYPES.CURLY_CLOSE_SINGLE; // ' (from 』)
    const openQ = QUOTE_TYPES.ANGLE_OPEN_SINGLE; // < (from 〈)
    const chunks = [
      makeChunk({ content: '说', translated: 'nói nói', translatedPunctuation: closeQ + openQ }),
      makeChunk({ content: '话', translated: 'lời' }),
    ];
    const result = cpp.reconstructText(chunks);
    expect(result).not.toContain(' ' + closeQ);
  });

  test('reconstructText does NOT NFC-normalize — passes content through as-is', () => {
    // Normalising is finishFullText's job, once over the whole text, not this method's.
    const nfd = 'ma\u0300u'; // NFD: a + U+0300 combining grave = 'à'
    const chunks = [makeChunk({ content: 'x', translated: nfd })];
    expect(cpp.reconstructText(chunks)).toBe(nfd);
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
    cpp.translatePunctuation(chunks, PUNCT);
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
    cpp.translatePunctuation(chunks, PUNCT);
    // comma + next chunk with content → space appended (correct behavior)
    expect(chunks[0].translatedPunctuation).toBe(', ');
    expect(chunks[1].openingPunctuation).toBe('');
  });
});

// ── Thousands separator ("2,700") ────────────────────────────────────────────

describe('ChunkPostProcessor: thousands separator', () => {
  const chunksFor2700 = () => [
    makeChunk({ content: '说2', translated: 'thuyết 2', punctuation: ',' }),
    makeChunk({ content: '700', punctuation: '！', startedBy: ',' }),
  ];

  test('reconstructText keeps "2,700" unspaced, and a full-width comma between digits spaced', () => {
    const cpp = new ChunkPostProcessor();
    const ascii = chunksFor2700();
    cpp.translatePunctuation(ascii, PUNCT);
    expect(cpp.reconstructText(ascii)).toBe('thuyết 2,700!');

    const fullWidth = chunksFor2700();
    fullWidth[0].punctuation = '，';
    cpp.translatePunctuation(fullWidth, PUNCT);
    expect(cpp.reconstructText(fullWidth)).toBe('thuyết 2, 700!');
  });

  // A progressive batch holds only the translatable chunks: the digit-only "700" chunk is not in
  // it, so the comma's neighbour must come from the full list.
  test('a batch that skips the digit-only chunk still reads the comma’s real neighbour', () => {
    const cpp = new ChunkPostProcessor();
    const all = [
      makeChunk({ content: '说2', translated: 'thuyết 2', punctuation: ',' }),
      makeChunk({ content: '700', punctuation: '！', startedBy: ',' }),
      makeChunk({ content: '别', translated: 'biệt', startedBy: '！' }),
    ];
    const batch = [all[0], all[2]];
    cpp.translatePunctuation(batch, PUNCT, all);
    expect(all[0].translatedPunctuation).toBe(',');
  });
});

// ── translatePunctuation runs twice per translation ──────────────────────────
// The batch loop translates each batch's chunks; the final pass translates every chunk again
// (cross-chunk comma and quote spacing). The dictionary must apply once, not once per pass.

describe('ChunkPostProcessor.translatePunctuation: the dictionary applies once', () => {
  /** @type {ChunkPostProcessor} */
  let cpp;
  beforeEach(() => {
    cpp = new ChunkPostProcessor();
  });

  /** The chunk's translatedPunctuation after one pass and after a second pass over the same chunk. */
  async function afterTwoPasses(punctuation, dict) {
    const translateText = await punctuationTranslator(dict);
    const chunks = [makeChunk({ content: '说', translated: 'x', punctuation })];
    cpp.translatePunctuation(chunks, translateText);
    const first = chunks[0].translatedPunctuation;
    cpp.translatePunctuation(chunks, translateText);
    return [first, chunks[0].translatedPunctuation];
  }

  test('a chained dictionary (「→“, “→") translates once, not twice', async () => {
    expect(await afterTwoPasses('「', { '「': '“', '“': '"' })).toEqual(['“', '“']);
  });

  test('a multi-character key (……→…) applies on the first pass, so a second pass changes nothing', async () => {
    expect(await afterTwoPasses('……', { '……': '…', '…': '…' })).toEqual(['…', '…']);
  });

  test('the longest key wins at each position', async () => {
    expect(await afterTwoPasses('……', { '…': 'a', '……': 'b' })).toEqual(['b', 'b']);
  });

  test('an empty value leaves the character as it is', async () => {
    expect(await afterTwoPasses('，', { '，': '' })).toEqual(['，', '，']);
  });

  test('the second pass still redoes the comma spacing against the finished neighbours', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'nói', punctuation: '，' }),
      makeChunk({ content: '' }),
    ];
    cpp.translatePunctuation(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(',');

    chunks[1].content = '话';
    cpp.translatePunctuation(chunks, PUNCT);
    expect(chunks[0].translatedPunctuation).toBe(', ');
  });

  test('the bundled punctuation dictionary turns …… into … on the first pass', async () => {
    const bundled = JSON.parse(fs.readFileSync('src/dictionaries/punctuation.json', 'utf-8'));
    const chunks = [makeChunk({ content: '说', translated: 'x', punctuation: '……' })];

    cpp.translatePunctuation(chunks, await punctuationTranslator(bundled));

    expect(chunks[0].translatedPunctuation).toBe('…');
  });
});

/**
 * Regression tests for applySmartCapitalization and fixAngleQuotePositioning.
 *
 * Covers the two structural cases that caused capitalization to silently fail:
 *   1. WASM TextChunker: consecutive punctuation combined (e.g. "：«") → startedBy contains colon
 *   2. JS TextChunker: empty 「-only chunk between colon chunk and content chunk
 *
 * Also covers the cleanupFormatting else-branch isParallelChunk guard indirectly
 * via the applySmartCapitalization comma case (biệt/đan must stay lowercase).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import { ChunkPostProcessor } from '../text/ChunkPostProcessor.js';
import { QUOTE_TYPES } from '../text/QuoteProcessor.js';

// Minimal dictionaries — only characters needed; capitalization is punctuation-driven
const DICTS = {
  characters: { 说: 'thuyết', 别: 'biệt', 单: 'đan', 道: 'nói' },
  phrases: {},
  patterns: {},
  properNouns: {},
  conversion: {},
};

function makeChunk(overrides) {
  return {
    content: '',
    punctuation: '',
    translatedPunctuation: '',
    openingPunctuation: '',
    startedBy: '',
    lineBreaks: '',
    startIndex: 0,
    translated: null,
    ...overrides,
  };
}

// ── applySmartCapitalization ────────────────────────────────────────────────

describe('TranslationEngine.applySmartCapitalization', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(DICTS, { activeProperNouns: ['properNouns'] });
  }, 30_000);

  test('start → capitalizes', () => {
    const chunks = [makeChunk({ content: '道', translated: 'nói', startedBy: 'start' })];
    engine.applySmartCapitalization(chunks);
    expect(chunks[0].translated).toBe('Nói');
  });

  test('WASM-style combined "：«" startedBy → capitalizes via colon includes() check', () => {
    // WASM combines ：+ 「 into one punctuation string; startedBy on content chunk is "：«"
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '：«' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[1].translated).toBe('Thuyết');
  });

  test('JS-style empty 「 chunk between colon chunk and content → fallback capitalizes', () => {
    // JS TextChunker creates a separate empty chunk for 「; colon stays in empty chunk's startedBy
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '：', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[2].translated).toBe('Thuyết');
  });

  test('linebreak + empty quote chunk → fallback capitalizes', () => {
    // After \n「 — empty chunk has lineBreaks set; content chunk must capitalize
    const chunks = [
      makeChunk({
        content: '',
        translated: null,
        startedBy: 'start',
        lineBreaks: '\n',
        punctuation: '「',
      }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[1].translated).toBe('Thuyết');
  });

  test('comma startedBy → no capitalization (biệt stays lowercase)', () => {
    const chunks = [makeChunk({ content: '别', translated: 'biệt', startedBy: '，' })];
    engine.applySmartCapitalization(chunks);
    expect(chunks[0].translated).toBe('biệt');
  });

  // BUG FIX (2026-08-29 review): the fallback block used to hand-copy its own punctuation
  // list, independently from the main multi-char block's sentenceEnders array — and had
  // already drifted, missing '．' (fullwidth middle dot, also used as a period) and never
  // checking ellipsis at all. Both are unified onto capitalizingPunctuation now.
  test('BUG FIX: fallback path capitalizes on "．" propagated through an empty chunk', () => {
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '．', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[2].translated).toBe('Thuyết');
  });

  test('BUG FIX: fallback path capitalizes on ellipsis "……" propagated through an empty chunk', () => {
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '……', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[2].translated).toBe('Thuyết');
  });

  // IMPROVEMENT (2026-08-29 review): capitalizeFirstLetter used to only skip leading
  // whitespace before looking for a letter to capitalize, via a hand-enumerated
  // Vietnamese-only char class. A chunk starting with a converted number (e.g.
  // NumberProcessor's "99.9%") was silently left untouched even when it should
  // capitalize the first real word after it. Now skips any leading non-letter run and
  // uses \p{L} (any Unicode letter) — mirrors the char-only capitalization fix from
  // earlier this session.
  test('IMPROVEMENT: capitalizes the first real word after a leading converted number', () => {
    const chunks = [makeChunk({ content: '', translated: '99.9% something', startedBy: 'start' })];
    engine.applySmartCapitalization(chunks);
    expect(chunks[0].translated).toBe('99.9% Something');
  });

  test('a chunk that is only a number stays unchanged (no letter to capitalize)', () => {
    const chunks = [makeChunk({ content: '', translated: '99.9%', startedBy: 'start' })];
    engine.applySmartCapitalization(chunks);
    expect(chunks[0].translated).toBe('99.9%');
  });

  test('full sequence: 道：「说，别，单 → Thuyết, biệt, đan (JS-style chunks)', () => {
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '：', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
      makeChunk({ content: '别', translated: 'biệt', startedBy: '，' }),
      makeChunk({ content: '单', translated: 'đan', startedBy: '，' }),
    ];
    engine.applySmartCapitalization(chunks);
    expect(chunks[2].translated).toBe('Thuyết');
    expect(chunks[3].translated).toBe('biệt');
    expect(chunks[4].translated).toBe('đan');
  });
});

// ── ChunkPostProcessor.fixAngleQuotePositioning ────────────────────────────

describe('ChunkPostProcessor.fixAngleQuotePositioning', () => {
  const chunker = new ChunkPostProcessor();

  test('「-only chunk: isOpeningQuote returns false → colon NOT propagated', () => {
    const chunks = [
      makeChunk({ content: '', punctuation: '「', startedBy: '：' }),
      makeChunk({ content: '说', punctuation: '，', startedBy: '「' }),
    ];
    chunker.fixAngleQuotePositioning(chunks);
    // startedBy must remain "「" (not "：«")
    expect(chunks[1].startedBy).toBe('「');
  });

  test('curly "-only chunk: colon propagated to nextChunk.startedBy', () => {
    const curlyOpen = QUOTE_TYPES.CURLY_OPEN_DOUBLE;
    const chunks = [
      makeChunk({ content: '', punctuation: curlyOpen, startedBy: '：' }),
      makeChunk({ content: '说', punctuation: '，', startedBy: curlyOpen }),
    ];
    chunker.fixAngleQuotePositioning(chunks);
    expect(chunks[1].startedBy).toBe('：' + curlyOpen);
  });

  test('《-only chunk: converted to curly double, colon propagated', () => {
    const chunks = [
      makeChunk({ content: '', punctuation: '《', startedBy: '：' }),
      makeChunk({ content: '说', punctuation: '，', startedBy: QUOTE_TYPES.CURLY_OPEN_DOUBLE }),
    ];
    chunker.fixAngleQuotePositioning(chunks);
    expect(chunks[1].startedBy).toBe('：' + QUOTE_TYPES.CURLY_OPEN_DOUBLE);
    expect(chunks[0].punctuation).toBe('');
  });

  test('curly "-only chunk without colon context: startedBy set to quote only', () => {
    const curlyOpen = QUOTE_TYPES.CURLY_OPEN_DOUBLE;
    const chunks = [
      makeChunk({ content: '', punctuation: curlyOpen, startedBy: '，' }),
      makeChunk({ content: '说', punctuation: '', startedBy: curlyOpen }),
    ];
    chunker.fixAngleQuotePositioning(chunks);
    expect(chunks[1].startedBy).toBe(curlyOpen);
  });
});

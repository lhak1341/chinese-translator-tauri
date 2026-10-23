/**
 * Regression tests for applySmartCapitalization (src/utils/text/FormattingPasses.ts, pure — no
 * engine) and fixAngleQuotePositioning, plus one engine-level test that the passes are called.
 *
 * Covers the two structural cases that caused capitalization to silently fail:
 *   1. WASM TextChunker: consecutive punctuation combined (e.g. "：«") → startedBy contains colon
 *   2. JS TextChunker: empty 「-only chunk between colon chunk and content chunk
 *
 * Also covers cleanupFormatting's capitalizeStart: false for a chunk indirectly
 * via the applySmartCapitalization comma case (biệt/đan must stay lowercase).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import { applyCharOnlySupplements, applySmartCapitalization } from '../text/FormattingPasses';
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

describe('applySmartCapitalization', () => {
  test('start → capitalizes', () => {
    const chunks = [makeChunk({ content: '道', translated: 'nói', startedBy: 'start' })];
    applySmartCapitalization(chunks, null);
    expect(chunks[0].translated).toBe('Nói');
  });

  test('WASM-style combined "：«" startedBy → capitalizes via colon includes() check', () => {
    // WASM combines ：+ 「 into one punctuation string; startedBy on content chunk is "：«"
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '：«' }),
    ];
    applySmartCapitalization(chunks, null);
    expect(chunks[1].translated).toBe('Thuyết');
  });

  test('JS-style empty 「 chunk between colon chunk and content → fallback capitalizes', () => {
    // JS TextChunker creates a separate empty chunk for 「; colon stays in empty chunk's startedBy
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '：', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    applySmartCapitalization(chunks, null);
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
    applySmartCapitalization(chunks, null);
    expect(chunks[1].translated).toBe('Thuyết');
  });

  test('comma startedBy → no capitalization (biệt stays lowercase)', () => {
    const chunks = [makeChunk({ content: '别', translated: 'biệt', startedBy: '，' })];
    applySmartCapitalization(chunks, null);
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
    applySmartCapitalization(chunks, null);
    expect(chunks[2].translated).toBe('Thuyết');
  });

  test('BUG FIX: fallback path capitalizes on ellipsis "……" propagated through an empty chunk', () => {
    const chunks = [
      makeChunk({ content: '道', translated: 'Nói', startedBy: 'start' }),
      makeChunk({ content: '', translated: null, startedBy: '……', punctuation: '「' }),
      makeChunk({ content: '说', translated: 'thuyết', startedBy: '「' }),
    ];
    applySmartCapitalization(chunks, null);
    expect(chunks[2].translated).toBe('Thuyết');
  });

  // FIX (2026-08-31): a chunk starting with a converted number must NOT force-capitalize
  // the word right after it — the number's unit/following word is part of the same
  // phrase, not a new sentence (e.g. "500 năm" must stay lowercase "năm", not "Năm").
  // Mirrors translateWithCharactersOnly's `/\d/.test(pre) ? m : ...` digit guard, which
  // capitalizeFirstLetter had drifted from.
  test('FIX: does not capitalize the word right after a leading converted number', () => {
    const chunks = [makeChunk({ content: '', translated: '99.9% something', startedBy: 'start' })];
    applySmartCapitalization(chunks, null);
    expect(chunks[0].translated).toBe('99.9% something');
  });

  test('FIX: "500 năm" stays lowercase after a leading converted number', () => {
    const chunks = [makeChunk({ content: '', translated: '500 năm', startedBy: 'start' })];
    applySmartCapitalization(chunks, null);
    expect(chunks[0].translated).toBe('500 năm');
  });

  test('a chunk that is only a number stays unchanged (no letter to capitalize)', () => {
    const chunks = [makeChunk({ content: '', translated: '99.9%', startedBy: 'start' })];
    applySmartCapitalization(chunks, null);
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
    applySmartCapitalization(chunks, null);
    expect(chunks[2].translated).toBe('Thuyết');
    expect(chunks[3].translated).toBe('biệt');
    expect(chunks[4].translated).toBe('đan');
  });
});

// ── ChunkPostProcessor.fixAngleQuotePositioning ────────────────────────────

describe('applySmartCapitalization — proper nouns', () => {
  const caps = new Map([['thori’dal', 'Thori’dal']]);

  test('restores dictionary casing outside a capitalizing context', () => {
    const chunks = [
      makeChunk({ content: '说', translated: 'thuyết', startedBy: 'start' }),
      makeChunk({ content: '别', translated: 'thori’dal', startedBy: '，' }),
    ];
    applySmartCapitalization(chunks, caps);
    expect(chunks[1].translated).toBe('Thori’dal');
  });

  test('leaves lowercase words alone when they are not proper nouns, and tolerates a null map', () => {
    const chunks = [makeChunk({ content: '别', translated: 'biệt', startedBy: '，' })];
    applySmartCapitalization(chunks, caps);
    expect(chunks[0].translated).toBe('biệt');
    applySmartCapitalization(chunks, null);
    expect(chunks[0].translated).toBe('biệt');
  });
});

describe('applyCharOnlySupplements', () => {
  test('spaces an em dash, and capitalizes after a sentence ender across a closing quote', () => {
    expect(applyCharOnlySupplements('a——b')).toBe('a—— b');
    expect(applyCharOnlySupplements('xong." tiếp')).toBe('xong." Tiếp');
  });

  test('does not capitalize after a decimal point', () => {
    expect(applyCharOnlySupplements('dài 1.75 mét')).toBe('dài 1.75 mét');
  });
});

describe('TranslationEngine calls the formatting passes in order', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(DICTS, { activeProperNouns: ['properNouns'] });
  }, 30_000);

  test('a text opening with punctuation still records each unit at its offset in the whole text', async () => {
    // Leading punctuation is its own chunk, so the content chunk's tokens start at 0 locally:
    // originalStart must add the chunk's startIndex or every Chinese run lands one early.
    const text = '“说别';
    const { semanticArrays } = await engine.translateWithSegments(text);
    for (const meta of semanticArrays.metadata) {
      expect(text.slice(meta.originalStart, meta.originalEnd)).toBe(
        semanticArrays.original[semanticArrays.metadata.indexOf(meta)]
      );
    }
  });

  test('capitalizes the start of the text but not after a comma', async () => {
    const result = await engine.translateWithSegments('说，别');
    expect(result.translatedText).toMatch(/^Thuyết/);
    expect(result.translatedText).toMatch(/[,，] biệt/);
  });

  test('onBatchComplete reports the text including the batch that just finished', async () => {
    const batches = [];
    await engine.translateWithSegments('说，别，说，别，说，别，说，别，说，别', {
      onBatchComplete: (data) => batches.push(data),
    });

    expect(batches.length).toBeGreaterThan(1);
    // Batch 1 already carries its own text (it used to be '' because the callback fired before
    // the batch was added), and each later batch extends the one before it.
    expect(batches[0].partialText).not.toBe('');
    for (let i = 1; i < batches.length; i++) {
      expect(batches[i].partialText.startsWith(batches[i - 1].partialText)).toBe(true);
      expect(batches[i].partialText.length).toBeGreaterThan(batches[i - 1].partialText.length);
    }
    const last = batches[batches.length - 1];
    expect(last.completedChunks).toBe(last.totalChunks);
  });

  test('the batch event carries text and counts only, never semantic arrays (ADR-105)', async () => {
    const batches = [];
    await engine.translateWithSegments('说，别，说，别，说，别，说，别，说，别', {
      onBatchComplete: (data) => batches.push(data),
    });

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(Object.keys(batch).sort()).toEqual([
        'avgTimePerChunk',
        'batchNumber',
        'completedChunks',
        'partialText',
        'totalChunks',
      ]);
    }
    const counts = batches.map((b) => b.completedChunks);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  test('onBatchComplete numbers batches 1..n', async () => {
    // currentBatchNumber was the 0-based index read with `||`, so batches 0 and 1 both said 1.
    const batches = [];
    await engine.translateWithSegments('说，别，说，别，说，别，说，别，说，别', {
      onBatchComplete: (data) => batches.push(data),
    });

    expect(batches.length).toBeGreaterThan(2);
    expect(batches.map((b) => b.batchNumber)).toEqual(batches.map((_, i) => i + 1));
  });
});

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

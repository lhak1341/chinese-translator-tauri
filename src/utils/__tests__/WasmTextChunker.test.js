import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockChunkText = vi.fn(() => JSON.stringify([]));
const mockGetStats = vi.fn(() =>
  JSON.stringify({ chunksProcessed: 0, totalTimeUs: 0, avgTimeUs: 0 })
);
const mockResetStats = vi.fn();
const mockRecordFallback = vi.fn();
const mockGetGlobalChunkerStats = vi.fn(() =>
  JSON.stringify({ totalChunks: 0, totalTimeUs: 0, avgTimeUs: 0, fallbackCount: 0 })
);
const mockInit = vi.fn();
const mockDestroy = vi.fn();

class MockTextChunker {
  chunkText(text) {
    return mockChunkText(text);
  }
  getStats() {
    return mockGetStats();
  }
  resetStats() {
    return mockResetStats();
  }
  // WasmTextChunker's retire path calls this wasm-bindgen internal — see CLAUDE.md's
  // documented WASM mock gotcha (WasmPatternProcessor instances need the same).
  __destroy_into_raw() {
    mockDestroy();
  }
}

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: (...args) => mockInit(...args),
  TextChunker: MockTextChunker,
  recordFallback: (...args) => mockRecordFallback(...args),
  getGlobalChunkerStats: (...args) => mockGetGlobalChunkerStats(...args),
}));

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mirrors src/utils/CLAUDE.md's documented WasmProcessorLifecycle mock pattern, extended
// with shared controllable state — same approach as WasmTextTokenizer.test.js.
const lifecycleState = vi.hoisted(() => ({
  isReady: false,
  hasFailed: false,
  pendingInit: null,
}));

vi.mock('../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      get isReady() {
        return lifecycleState.isReady;
      },
      get hasFailed() {
        return lifecycleState.hasFailed;
      },
      get pendingInit() {
        return lifecycleState.pendingInit;
      },
      initialize: vi.fn(async (instantiateFn) => {
        if (lifecycleState.hasFailed) return false;
        await instantiateFn(new ArrayBuffer(0));
        lifecycleState.isReady = true;
        return true;
      }),
      permanentlyFail: vi.fn(() => {
        lifecycleState.isReady = false;
        lifecycleState.hasFailed = true;
      }),
    };
  }),
}));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

// initializeWasm() caches lifecycle state at module scope — reset modules between tests so
// each test gets a fresh, uninitialized copy, and reset the shared lifecycle state too (it
// lives outside the mocked module, so resetModules() alone doesn't touch it). TextChunker.js
// is imported fresh here too (not as a static top-of-file import) so its transitively-imported
// wasmTextChunker singleton never leaks lifecycle state across tests.
async function importFresh() {
  vi.resetModules();
  lifecycleState.isReady = false;
  lifecycleState.hasFailed = false;
  lifecycleState.pendingInit = null;
  const wasmTextChunkerModule = await import('../wasm/WasmTextChunker.js');
  const cascadeModule = await import('../wasm/WasmCascadeRegistry.js');
  const textChunkerModule = await import('../text/TextChunker.js');
  return { ...wasmTextChunkerModule, ...cascadeModule, ...textChunkerModule };
}

describe('WasmTextChunker', () => {
  beforeEach(() => {
    mockChunkText.mockReset();
    mockChunkText.mockReturnValue(JSON.stringify([]));
    mockGetStats.mockReset();
    mockGetStats.mockReturnValue(
      JSON.stringify({ chunksProcessed: 0, totalTimeUs: 0, avgTimeUs: 0 })
    );
    mockResetStats.mockReset();
    mockRecordFallback.mockReset();
    mockGetGlobalChunkerStats.mockReset();
    mockGetGlobalChunkerStats.mockReturnValue(
      JSON.stringify({ totalChunks: 0, totalTimeUs: 0, avgTimeUs: 0, fallbackCount: 0 })
    );
    mockInit.mockReset();
    mockDestroy.mockReset();
  });

  describe('chunkText()', () => {
    test('returns null and lazily triggers init on first call, uses WASM once ready', async () => {
      const { wasmTextChunker } = await importFresh();
      const chunks = [
        { content: 'Hello', punctuation: ',', startIndex: 0, lineBreaks: '', startedBy: 'start' },
      ];
      mockChunkText.mockReturnValue(JSON.stringify(chunks));

      const first = wasmTextChunker.chunkText('Hello, world!');
      expect(first).toBeNull();
      expect(mockChunkText).not.toHaveBeenCalled();

      await flushMicrotasks();

      const second = wasmTextChunker.chunkText('Hello, world!');
      expect(second).toEqual(chunks);
    });

    test('parses the JSON string the WASM instance returns', async () => {
      const { wasmTextChunker } = await importFresh();
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();

      const chunks = [
        { content: '你', punctuation: '，', startIndex: 0, lineBreaks: '', startedBy: 'start' },
      ];
      mockChunkText.mockReturnValue(JSON.stringify(chunks));

      expect(wasmTextChunker.chunkText('你，')).toEqual(chunks);
    });

    test('a real WASM panic permanently retires the wrapper — later calls stay JS fallback', async () => {
      const { wasmTextChunker } = await importFresh();
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();

      mockChunkText.mockImplementationOnce(() => {
        throw new Error('wasm panic');
      });
      expect(wasmTextChunker.chunkText('boom')).toBeNull();

      // Even with a healthy mock again, retirement is permanent — no re-init attempt.
      mockChunkText.mockReturnValue(JSON.stringify([{ content: 'x', startIndex: 0 }]));
      expect(wasmTextChunker.chunkText('after panic')).toBeNull();
      expect(mockChunkText).toHaveBeenCalledTimes(1); // the throwing call only — warm-up never reached it
      // The cascade handler is the one place that destroys the instance, and it runs once.
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    test('malformed JSON from WASM is treated as a panic — retires and falls back', async () => {
      const { wasmTextChunker } = await importFresh();
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();

      mockChunkText.mockReturnValue('not valid json{{{');
      expect(wasmTextChunker.chunkText('bad json')).toBeNull();

      mockChunkText.mockReturnValue(JSON.stringify([{ content: 'x', startIndex: 0 }]));
      expect(wasmTextChunker.chunkText('after')).toBeNull(); // permanently retired, same as a real panic
    });

    test('registers with the shared cascade registry — a sibling panic retires this wrapper too', async () => {
      const { wasmTextChunker, fireCascadeRetire } = await importFresh();
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();
      mockChunkText.mockReturnValue(JSON.stringify([{ content: 'x', startIndex: 0 }]));
      expect(wasmTextChunker.chunkText('ready')).not.toBeNull();

      // Simulates ANOTHER wrapper's catch block firing the cascade — this wrapper never panicked itself.
      fireCascadeRetire();

      expect(wasmTextChunker.chunkText('after cascade')).toBeNull();
    });

    test('re-entrancy guard blocks a nested chunkText call while one is in flight', async () => {
      const { wasmTextChunker } = await importFresh();
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();

      let nestedResult = 'not called';
      mockChunkText.mockImplementationOnce(() => {
        // Simulates a WASM callback re-entering chunkText while the outer borrow_mut is live —
        // the exact scenario isProcessing exists to prevent a second-borrow panic for.
        nestedResult = wasmTextChunker.chunkText('nested call');
        return JSON.stringify([{ content: 'outer', startIndex: 0 }]);
      });

      const outerResult = wasmTextChunker.chunkText('outer call');

      expect(nestedResult).toBeNull();
      expect(outerResult).toEqual([{ content: 'outer', startIndex: 0 }]);
    });
  });

  describe('getStats() / resetStats() / getGlobalStats()', () => {
    test('getStats returns zeroed shape when not ready', async () => {
      const { wasmTextChunker } = await importFresh();

      expect(wasmTextChunker.getStats()).toMatchObject({ chunksProcessed: 0, wasmHits: 0 });
    });

    test('getStats merges WASM stats with wasmHits/fallbackHits once ready', async () => {
      const { wasmTextChunker } = await importFresh();
      mockChunkText.mockReturnValue(JSON.stringify([{ content: 'x', startIndex: 0 }]));
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();
      wasmTextChunker.chunkText('one'); // wasmHits = 1

      const stats = wasmTextChunker.getStats();
      expect(stats.wasmHits).toBe(1);
      expect(stats).toHaveProperty('hitRate');
    });

    test('resetStats zeroes hit counters and calls into the WASM instance', async () => {
      const { wasmTextChunker } = await importFresh();
      mockChunkText.mockReturnValue(JSON.stringify([{ content: 'x', startIndex: 0 }]));
      wasmTextChunker.chunkText('warm up');
      await flushMicrotasks();
      wasmTextChunker.chunkText('one');

      wasmTextChunker.resetStats();

      expect(mockResetStats).toHaveBeenCalled();
      expect(wasmTextChunker.getStats().wasmHits).toBe(0);
    });

    test('getGlobalStats reads the module-level Rust counter', async () => {
      const { wasmTextChunker } = await importFresh();
      mockGetGlobalChunkerStats.mockReturnValue(JSON.stringify({ totalChunks: 5 }));

      expect(wasmTextChunker.getGlobalStats()).toEqual({ totalChunks: 5 });
    });
  });

  describe('fallback tracking when WASM is not ready', () => {
    test('records a fallback hit and increments fallbackHits before any init completes', async () => {
      const { wasmTextChunker } = await importFresh();

      const result = wasmTextChunker.chunkText('too early');

      expect(result).toBeNull();
      expect(mockRecordFallback).toHaveBeenCalled();
      expect(wasmTextChunker.getStats().fallbackCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Integration with TextChunker (JS-facing shape)', () => {
    test('TextChunker.chunkText never throws and returns array-shaped chunks', async () => {
      const { TextChunker } = await importFresh();
      const chunker = new TextChunker();
      const text = 'Hello, world! 你好，世界！';

      expect(() => chunker.chunkText(text)).not.toThrow();

      const chunks = chunker.chunkText(text);
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    test('produces TextChunk objects with the expected fields', async () => {
      const { TextChunker } = await importFresh();
      const chunker = new TextChunker();
      const chunks = chunker.chunkText('Test, text.');

      chunks.forEach((chunk) => {
        expect(chunk).toHaveProperty('content');
        expect(chunk).toHaveProperty('punctuation');
        expect(chunk).toHaveProperty('startIndex');
        expect(chunk).toHaveProperty('endIndex');
        expect(chunk).toHaveProperty('startedBy');
        expect(chunk).toHaveProperty('lineBreaks');
        expect(chunk).toHaveProperty('translated');
        expect(chunk).toHaveProperty('translatedPunctuation');
      });
    });
  });
});

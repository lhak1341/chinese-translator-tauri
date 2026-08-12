import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockTokenizeText = vi.fn(() => null);
const mockGetTokenizerStats = vi.fn();
const mockInit = vi.fn();

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: (...args) => mockInit(...args),
  tokenizeText: (...args) => mockTokenizeText(...args),
  getTokenizerStats: (...args) => mockGetTokenizerStats(...args),
}));

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mirrors src/utils/CLAUDE.md's documented WasmProcessorLifecycle mock pattern, extended
// with a shared controllable state so tests can drive isReady/hasFailed/permanentlyFail
// directly instead of only proving the happy path.
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

// initializeWasm() caches lifecycle state at module scope — reset modules between tests
// so each test gets a fresh, uninitialized copy, and reset the shared lifecycle state too
// (it lives outside the mocked module, so resetModules() alone doesn't touch it).
async function importFresh() {
  vi.resetModules();
  lifecycleState.isReady = false;
  lifecycleState.hasFailed = false;
  lifecycleState.pendingInit = null;
  const wasmTextTokenizerModule = await import('../wasm/WasmTextTokenizer.js');
  const cascadeModule = await import('../wasm/WasmCascadeRegistry.js');
  return { ...wasmTextTokenizerModule, ...cascadeModule };
}

describe('WasmTextTokenizer', () => {
  beforeEach(() => {
    mockTokenizeText.mockReset();
    mockTokenizeText.mockReturnValue(null);
    mockGetTokenizerStats.mockReset();
    mockInit.mockReset();
  });

  describe('tokenize()', () => {
    test('returns null and lazily triggers init on first call, uses WASM once ready', async () => {
      const { wasmTextTokenizer } = await importFresh();
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);

      const first = wasmTextTokenizer.tokenize('你好');
      expect(first).toBeNull();
      expect(mockTokenizeText).not.toHaveBeenCalled();

      await flushMicrotasks();

      const second = wasmTextTokenizer.tokenize('你好');
      expect(second).toEqual([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);
    });

    test('normalizes text to NFC before calling the WASM tokenizer', async () => {
      const { wasmTextTokenizer } = await importFresh();
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);
      wasmTextTokenizer.tokenize('warm up');
      await flushMicrotasks();

      const decomposed = '你́'; // combining mark form
      wasmTextTokenizer.tokenize(decomposed);

      expect(mockTokenizeText).toHaveBeenLastCalledWith(decomposed.normalize('NFC'));
    });

    test('a real WASM panic permanently retires the wrapper — later calls stay JS fallback', async () => {
      const { wasmTextTokenizer } = await importFresh();
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);
      wasmTextTokenizer.tokenize('warm up');
      await flushMicrotasks();

      mockTokenizeText.mockImplementationOnce(() => {
        throw new Error('wasm panic');
      });
      expect(wasmTextTokenizer.tokenize('你好')).toBeNull();

      // Even with a healthy mock again, retirement is permanent — no re-init attempt.
      // The warm-up call above never reached tokenizeText (lifecycle wasn't ready yet),
      // so only the throwing call counts here.
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);
      expect(wasmTextTokenizer.tokenize('你好')).toBeNull();
      expect(mockTokenizeText).toHaveBeenCalledTimes(1);
    });

    test('registers with the shared cascade registry — a sibling panic retires this wrapper too', async () => {
      const { wasmTextTokenizer, fireCascadeRetire } = await importFresh();
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);
      wasmTextTokenizer.tokenize('warm up');
      await flushMicrotasks();
      expect(wasmTextTokenizer.tokenize('你')).not.toBeNull();

      // Simulates ANOTHER wrapper's catch block firing the cascade — this wrapper never panicked itself.
      fireCascadeRetire();

      expect(wasmTextTokenizer.tokenize('你')).toBeNull();
    });
  });

  describe('getStats()', () => {
    test('returns null when not initialized', async () => {
      const { wasmTextTokenizer } = await importFresh();

      expect(wasmTextTokenizer.getStats()).toBeNull();
    });

    test('returns stats from the WASM module when initialized', async () => {
      const { wasmTextTokenizer } = await importFresh();
      wasmTextTokenizer.tokenize('warm up');
      await flushMicrotasks();
      mockGetTokenizerStats.mockReturnValue({ implementation: 'wasm' });

      expect(wasmTextTokenizer.getStats()).toEqual({ implementation: 'wasm' });
    });

    test('returns null when the WASM call throws', async () => {
      const { wasmTextTokenizer } = await importFresh();
      wasmTextTokenizer.tokenize('warm up');
      await flushMicrotasks();
      mockGetTokenizerStats.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(wasmTextTokenizer.getStats()).toBeNull();
    });
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockTokenizeText = vi.fn();
const mockGetTokenizerStats = vi.fn();

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  tokenizeText: (...args) => mockTokenizeText(...args),
  getTokenizerStats: (...args) => mockGetTokenizerStats(...args),
}));

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// initializeWasm() caches success at module scope — reset modules between tests
// so each test gets a fresh, uninitialized copy.
async function importFresh() {
  vi.resetModules();
  return await import('../wasm/WasmTextTokenizer.js');
}

describe('WasmTextTokenizer', () => {
  beforeEach(() => {
    mockTokenizeText.mockReset();
    mockGetTokenizerStats.mockReset();
  });

  describe('initialize()', () => {
    test('returns true and marks initialized when the WASM module loads', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();

      const result = await tokenizer.initialize();

      expect(result).toBe(true);
      expect(tokenizer.isAvailable()).toBe(true);
    });
  });

  describe('tokenize()', () => {
    test('normalizes text to NFC before calling the WASM tokenizer', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      await tokenizer.initialize();
      mockTokenizeText.mockReturnValue([{ type: 'chinese_char', value: '你', start: 0, end: 1 }]);

      const decomposed = '你́'; // combining mark form
      tokenizer.tokenize(decomposed);

      expect(mockTokenizeText).toHaveBeenCalledWith(decomposed.normalize('NFC'));
    });

    test('returns null without calling WASM when not initialized', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      // deliberately not initialized

      const result = tokenizer.tokenize('你好');

      expect(result).toBeNull();
      expect(mockTokenizeText).not.toHaveBeenCalled();
    });

    test('returns null when the WASM call throws', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      await tokenizer.initialize();
      mockTokenizeText.mockImplementation(() => {
        throw new Error('wasm panic');
      });

      expect(tokenizer.tokenize('你好')).toBeNull();
    });

    test('returns the raw WASM token array on success', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      await tokenizer.initialize();
      const wasmTokens = [{ type: 'chinese_char', value: '你', start: 0, end: 1 }];
      mockTokenizeText.mockReturnValue(wasmTokens);

      expect(tokenizer.tokenize('你')).toBe(wasmTokens);
    });
  });

  describe('getStats()', () => {
    test('returns null when not initialized', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();

      expect(tokenizer.getStats()).toBeNull();
    });

    test('returns stats from the WASM module when initialized', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      await tokenizer.initialize();
      mockGetTokenizerStats.mockReturnValue({ implementation: 'wasm' });

      expect(tokenizer.getStats()).toEqual({ implementation: 'wasm' });
    });

    test('returns null when the WASM call throws', async () => {
      const { WasmTextTokenizer } = await importFresh();
      const tokenizer = new WasmTextTokenizer();
      await tokenizer.initialize();
      mockGetTokenizerStats.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(tokenizer.getStats()).toBeNull();
    });
  });

  describe('isWasmTextTokenizerSupported', () => {
    test('reflects whether the WASM module initializes', async () => {
      const { isWasmTextTokenizerSupported } = await importFresh();

      expect(await isWasmTextTokenizerSupported()).toBe(true);
    });
  });
});

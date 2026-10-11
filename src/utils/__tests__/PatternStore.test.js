// PatternStore holds the parsed pattern list; the WASM processor is mocked so its init result
// is under test control.

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../wasm/WasmPatternProcessor.js', () => ({
  reinitializeWasmPatternProcessor: vi.fn().mockResolvedValue(false),
}));
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { PatternStore } from '../pattern/PatternStore.js';
import { reinitializeWasmPatternProcessor } from '../wasm/WasmPatternProcessor.js';
import { logger } from '../logger.js';

beforeEach(() => {
  vi.clearAllMocks();
  reinitializeWasmPatternProcessor.mockResolvedValue(false);
});

describe('PatternStore', () => {
  test('starts empty and uninitialized', () => {
    const store = new PatternStore();
    expect(store.isInitialized).toBe(false);
    expect(store.wasmAvailable).toBe(false);
    expect(store.patterns).toEqual([]);
  });

  test('reads string and object entries into the fields its readers use', async () => {
    const store = new PatternStore();
    await store.initializePatterns({
      X的Y: 'Y của X',
      X是: { translation: 'là X', allowAsPatternVariable: true },
    });

    expect(store.isInitialized).toBe(true);
    expect(store.patterns).toEqual([
      { originalPattern: 'X的Y', template: 'Y của X', allowAsPatternVariable: false },
      { originalPattern: 'X是', template: 'là X', allowAsPatternVariable: true },
    ]);
  });

  test('re-initialization replaces the previous patterns', async () => {
    const store = new PatternStore();
    await store.initializePatterns({ X的: 'của X' });
    await store.initializePatterns({ X是Y: 'Y là X' });
    expect(store.patterns.map((p) => p.originalPattern)).toEqual(['X是Y']);
  });

  test('an empty dictionary is initialized with no patterns', async () => {
    const store = new PatternStore();
    await store.initializePatterns({});
    expect(store.isInitialized).toBe(true);
    expect(store.patterns).toHaveLength(0);
  });

  test('hands the raw dictionary to the WASM processor and records its result', async () => {
    reinitializeWasmPatternProcessor.mockResolvedValue(true);
    const dict = { X的Y: 'Y của X' };
    const store = new PatternStore();
    await store.initializePatterns(dict);
    expect(reinitializeWasmPatternProcessor).toHaveBeenCalledWith(dict);
    expect(store.wasmAvailable).toBe(true);
  });

  test('a WASM init that throws leaves the patterns loaded and wasmAvailable false', async () => {
    reinitializeWasmPatternProcessor.mockRejectedValue(new Error('no wasm'));
    const store = new PatternStore();
    await store.initializePatterns({ X的Y: 'Y của X' });
    expect(store.wasmAvailable).toBe(false);
    expect(store.patterns).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('warns when a template drops a variable its pattern declares', async () => {
    const store = new PatternStore();
    await store.initializePatterns({ X的Y: 'của X' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('X的Y'),
      expect.stringContaining('missing variables: Y')
    );
  });

  test('a variable letter inside fixed template text is not a missing variable', async () => {
    const store = new PatternStore();
    await store.initializePatterns({ 赤姓X: 'X họ Xích' });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

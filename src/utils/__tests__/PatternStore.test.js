// PatternStore holds the parsed pattern list and decides whether Phase 1 runs. The WASM processor
// init and `TwoPhasePatternProcessor` are mocked, so the init result and each matcher call are
// under test control; `PatternFailureTracker` is real.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const { processTokens, constructed } = vi.hoisted(() => ({
  processTokens: vi.fn(),
  constructed: [],
}));

vi.mock('../wasm/WasmPatternProcessor.js', () => ({
  reinitializeWasmPatternProcessor: vi.fn().mockResolvedValue(false),
}));
vi.mock('../pattern/TwoPhasePatternProcessor.js', () => ({
  default: class {
    constructor(patterns) {
      constructed.push(patterns);
      this.processTokens = processTokens;
    }
  },
}));
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));
vi.mock('../toast', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { PatternStore } from '../pattern/PatternStore.js';
import { reinitializeWasmPatternProcessor } from '../wasm/WasmPatternProcessor.js';
import { logger } from '../logger.js';
import toast from '../toast';

const WINDOW_MS = 5 * 60 * 1000;
const tokens = () => [{ type: 'chinese_char', value: '说', translated: null }];
const context = { activeProperNouns: ['properNouns'], dictionaryManager: { name: 'dm' } };

beforeEach(() => {
  vi.clearAllMocks();
  constructed.length = 0;
  reinitializeWasmPatternProcessor.mockResolvedValue(false);
  processTokens.mockResolvedValue([]);
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

describe('initializePatterns decides whether Phase 1 runs', () => {
  test('patterns loaded but WASM unavailable: off from the first call, with an error toast', async () => {
    const store = new PatternStore();
    await store.initializePatterns({ X的Y: 'Y của X' });

    expect(store.processor).toBeNull();
    expect(await store.matchTokens(tokens(), context)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/Phase 1 \(patterns\) is skipped/)
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/unavailable/);
    // Skipped, not attempted: a call that reached a processor would warn as a failure
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test('WASM available: the processor is built from the patterns up front', async () => {
    reinitializeWasmPatternProcessor.mockResolvedValue(true);
    const store = new PatternStore();
    await store.initializePatterns({ X的Y: 'Y của X' });

    expect(store.processor).not.toBeNull();
    expect(constructed).toEqual([store.patterns]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('no patterns loaded: no processor, no toast', async () => {
    const store = new PatternStore();
    await store.initializePatterns({});

    expect(store.processor).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('a store that never initialized skips Phase 1', async () => {
    expect(await new PatternStore().matchTokens(tokens(), context)).toBeNull();
  });
});

describe('matchTokens and WASM matcher failures', () => {
  async function readyStore() {
    reinitializeWasmPatternProcessor.mockResolvedValue(true);
    const store = new PatternStore();
    await store.initializePatterns({ X的Y: 'Y của X' });
    return store;
  }
  const fail = (message = 'boom') => processTokens.mockRejectedValue(new Error(message));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns the processor results, handing it the context unchanged', async () => {
    const store = await readyStore();
    const results = [{ start: 0 }];
    processTokens.mockResolvedValue(results);
    const t = tokens();

    expect(await store.matchTokens(t, context)).toBe(results);
    expect(processTokens).toHaveBeenCalledWith(t, context);
  });

  test('a failure skips Phase 1 for that call and does not throw', async () => {
    const store = await readyStore();
    fail();

    expect(await store.matchTokens(tokens(), context)).toBeNull();
    expect(store.enabled).toBe(true);
  });

  test('the first failure warns with its attempt number; the next stays quiet', async () => {
    const store = await readyStore();
    fail();

    await store.matchTokens(tokens(), context);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning.mock.calls[0][0]).toMatch(/attempt 1\/3/);

    await store.matchTokens(tokens(), context);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('three failures within the window of a success switch Phase 1 off', async () => {
    const store = await readyStore();
    await store.matchTokens(tokens(), context); // a success starts the window
    fail();

    await store.matchTokens(tokens(), context);
    await store.matchTokens(tokens(), context);
    expect(store.enabled).toBe(true);
    await store.matchTokens(tokens(), context);

    expect(store.enabled).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/turned off/);
  });

  test('a WASM matcher that never succeeded is switched off too', async () => {
    const store = await readyStore();
    fail('WASM Pattern Processor not available');

    for (let i = 0; i < 3; i++) await store.matchTokens(tokens(), context);

    expect(store.enabled).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('after the switch-off the processor is not called and is kept for profiling', async () => {
    const store = await readyStore();
    fail();
    for (let i = 0; i < 3; i++) await store.matchTokens(tokens(), context);
    processTokens.mockClear();

    expect(await store.matchTokens(tokens(), context)).toBeNull();
    expect(processTokens).not.toHaveBeenCalled();
    expect(store.processor).not.toBeNull();
  });

  test('failures that straddle the window reset the counter instead of switching off', async () => {
    const store = await readyStore();
    await store.matchTokens(tokens(), context);
    fail();
    await store.matchTokens(tokens(), context);
    await store.matchTokens(tokens(), context);
    vi.advanceTimersByTime(WINDOW_MS + 1);

    await store.matchTokens(tokens(), context);

    expect(store.enabled).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning.mock.calls.at(-1)[0]).toMatch(/attempt 1\/3/);
  });

  test('a success after failures logs the recovery', async () => {
    const store = await readyStore();
    fail();
    await store.matchTokens(tokens(), context);
    processTokens.mockResolvedValue([]);

    await store.matchTokens(tokens(), context);

    expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/recovered after 1 previous/));
  });
});

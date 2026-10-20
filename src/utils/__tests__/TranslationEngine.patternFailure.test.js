/**
 * The engine side of Phase 1 (architecture review round 35, candidate #2): `applyPatterns` asks the
 * Pattern Store for results and applies them. Whether Phase 1 runs, the failure counting and the
 * toasts are the store's and are tested in `PatternStore.test.js`. Here the store, its
 * `PatternFailureTracker` and `applyHierarchicalResults` are real; the WASM init and
 * `TwoPhasePatternProcessor` are mocked.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const { processTokens } = vi.hoisted(() => ({ processTokens: vi.fn() }));

vi.mock('../toast', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('../wasm/WasmPatternProcessor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  reinitializeWasmPatternProcessor: vi.fn().mockResolvedValue(true),
}));
vi.mock('../pattern/TwoPhasePatternProcessor.js', () => ({
  default: class {
    constructor() {
      this.processTokens = processTokens;
    }
  },
}));

import { logger } from '../logger';
import { TranslationEngine } from '../TranslationEngine.js';

const tokens = () => [{ type: 'chinese_char', value: '说', translated: null }];

async function readyEngine() {
  const engine = new TranslationEngine();
  engine.activeProperNouns = ['properNouns'];
  engine.dictionaryManager = { name: 'dm' };
  await engine.patternStore.initializePatterns({ X的Y: 'Y của X' });
  return engine;
}

beforeEach(() => {
  vi.clearAllMocks();
  processTokens.mockResolvedValue([]);
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyPatterns', () => {
  test('hands the processor only the two option keys it reads', async () => {
    const engine = await readyEngine();
    const t = tokens();

    // The translation options carry an array and a callback no pattern processor reads.
    await engine.applyPatterns(t, { segments: [1, 2], onProgress: () => {} });

    expect(processTokens).toHaveBeenCalledTimes(1);
    const handed = processTokens.mock.calls[0][1];
    expect(Object.keys(handed).sort()).toEqual(['activeProperNouns', 'dictionaryManager']);
    expect(handed.activeProperNouns).toEqual(['properNouns']);
    expect(handed.dictionaryManager).toBe(engine.dictionaryManager);
  });

  test('a skip from the store leaves the tokens untouched', async () => {
    const engine = await readyEngine();
    processTokens.mockRejectedValue(new Error('boom'));
    const apply = vi.spyOn(engine, 'applyHierarchicalResults');
    const t = tokens();

    await expect(engine.applyPatterns(t, {})).resolves.toBeUndefined();

    expect(apply).not.toHaveBeenCalled();
    expect(t[0].translated).toBeNull();
  });

  test('an error while applying the results escapes and is not counted as a matcher failure', async () => {
    const engine = await readyEngine();
    vi.spyOn(engine, 'applyHierarchicalResults').mockImplementation(() => {
      throw new Error('write bug');
    });
    const reportFailure = vi.spyOn(engine.patternStore.failureTracker, 'reportFailure');

    await expect(engine.applyPatterns(tokens(), {})).rejects.toThrow('write bug');

    expect(reportFailure).not.toHaveBeenCalled();
    expect(engine.patternStore.enabled).toBe(true);
  });
});

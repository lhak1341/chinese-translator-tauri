/**
 * What `applyPatterns` does when Phase 1 throws (architecture review 2026-10-09, round 21,
 * candidate #3): which toast, when the WASM path is switched off, and that a failure on the
 * JS path never touches the WASM failure counter. The processors are stubs; the engine, its
 * `PatternFailureTracker`s and `applyHierarchicalResults` are real.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../toast', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import toast from '../toast';
import { logger } from '../logger';
import { TranslationEngine } from '../TranslationEngine.js';

const WINDOW_MS = 5 * 60 * 1000;
const tokens = () => [{ type: 'chinese_char', value: '说', translated: null }];

function engineWith({ wasm }) {
  const engine = new TranslationEngine();
  engine.semanticPatternProcessor.isInitialized = true;
  engine.semanticPatternProcessor.patterns = [{ originalPattern: 'X的Y' }];
  engine.activeProperNouns = ['properNouns'];
  engine.settings.enableTwoPhasePatterns = wasm;
  engine.twoPhaseProcessor = { processTokens: vi.fn().mockResolvedValue([]) };
  engine.semanticPatternProcessor.buildVariableCache = vi.fn();
  engine.semanticPatternProcessor.processTokens = vi.fn().mockResolvedValue([]);
  return engine;
}

const failWith = (processTokens, message = 'boom') =>
  processTokens.mockRejectedValue(new Error(message));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WASM path failures', () => {
  test('a failure skips Phase 1 for that call and does not throw', async () => {
    const engine = engineWith({ wasm: true });
    failWith(engine.twoPhaseProcessor.processTokens);
    const t = tokens();

    await expect(engine.applyPatterns(t, {})).resolves.toBeUndefined();

    expect(t[0].translated).toBeNull();
    expect(engine.settings.enableTwoPhasePatterns).toBe(true);
  });

  test('the first failure warns with its attempt number; the next stays quiet', async () => {
    const engine = engineWith({ wasm: true });
    failWith(engine.twoPhaseProcessor.processTokens);

    await engine.applyPatterns(tokens(), {});
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning.mock.calls[0][0]).toMatch(/attempt 1\/3/);

    await engine.applyPatterns(tokens(), {});
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('three failures within the window of a success turn the WASM path off', async () => {
    const engine = engineWith({ wasm: true });
    await engine.applyPatterns(tokens(), {}); // a success starts the window
    failWith(engine.twoPhaseProcessor.processTokens);

    await engine.applyPatterns(tokens(), {});
    await engine.applyPatterns(tokens(), {});
    expect(engine.settings.enableTwoPhasePatterns).toBe(true);
    await engine.applyPatterns(tokens(), {});

    expect(engine.settings.enableTwoPhasePatterns).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/turned off/);
  });

  test('a WASM path that never succeeded is switched off too', async () => {
    const engine = engineWith({ wasm: true });
    failWith(engine.twoPhaseProcessor.processTokens, 'WASM Pattern Processor not available');

    for (let i = 0; i < 3; i++) await engine.applyPatterns(tokens(), {});

    expect(engine.settings.enableTwoPhasePatterns).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('after the switch-off the next call takes the JS path', async () => {
    const engine = engineWith({ wasm: true });
    await engine.applyPatterns(tokens(), {});
    failWith(engine.twoPhaseProcessor.processTokens);
    for (let i = 0; i < 3; i++) await engine.applyPatterns(tokens(), {});
    engine.twoPhaseProcessor.processTokens.mockClear();

    await engine.applyPatterns(tokens(), {});

    expect(engine.twoPhaseProcessor.processTokens).not.toHaveBeenCalled();
    expect(engine.semanticPatternProcessor.processTokens).toHaveBeenCalledTimes(1);
  });

  test('failures that straddle the window reset the counter instead of disabling', async () => {
    const engine = engineWith({ wasm: true });
    await engine.applyPatterns(tokens(), {});
    failWith(engine.twoPhaseProcessor.processTokens);
    await engine.applyPatterns(tokens(), {});
    await engine.applyPatterns(tokens(), {});
    vi.advanceTimersByTime(WINDOW_MS + 1);

    await engine.applyPatterns(tokens(), {});

    expect(engine.settings.enableTwoPhasePatterns).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning.mock.calls.at(-1)[0]).toMatch(/attempt 1\/3/);
  });

  test('a success after failures logs the recovery', async () => {
    const engine = engineWith({ wasm: true });
    failWith(engine.twoPhaseProcessor.processTokens);
    await engine.applyPatterns(tokens(), {});
    engine.twoPhaseProcessor.processTokens.mockResolvedValue([]);

    await engine.applyPatterns(tokens(), {});

    expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/recovered after 1 previous/));
  });
});

describe('JS path failures', () => {
  test('warn once, never mention WASM, never switch anything off', async () => {
    const engine = engineWith({ wasm: false });
    failWith(engine.semanticPatternProcessor.processTokens);

    for (let i = 0; i < 6; i++) await engine.applyPatterns(tokens(), {});

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning.mock.calls[0][0]).not.toMatch(/attempt|WASM/);
    expect(engine.settings.enableTwoPhasePatterns).toBe(false);
  });

  test('do not count toward the WASM path', async () => {
    const engine = engineWith({ wasm: false });
    failWith(engine.semanticPatternProcessor.processTokens);
    await engine.applyPatterns(tokens(), {});
    await engine.applyPatterns(tokens(), {});
    expect(engine.patternFailureTracker.count).toBe(0);
  });

  test('a JS success lets a later failure warn again', async () => {
    const engine = engineWith({ wasm: false });
    failWith(engine.semanticPatternProcessor.processTokens);
    await engine.applyPatterns(tokens(), {});
    engine.semanticPatternProcessor.processTokens.mockResolvedValue([]);
    await engine.applyPatterns(tokens(), {});
    failWith(engine.semanticPatternProcessor.processTokens);

    await engine.applyPatterns(tokens(), {});

    expect(toast.warning).toHaveBeenCalledTimes(2);
  });
});

describe('initialize decides the Phase 1 path up front', () => {
  const dictionaries = {
    characters: { 说: 'nói' },
    phrases: {},
    patterns: { X的Y: 'Y của X' },
    properNouns: {},
    conversion: {},
  };

  async function initWith({ wasmAvailable, patterns }) {
    const engine = new TranslationEngine();
    vi.spyOn(engine.semanticPatternProcessor, 'initializePatterns').mockImplementation(async () => {
      engine.semanticPatternProcessor.patterns = patterns;
      engine.semanticPatternProcessor.wasmAvailable = wasmAvailable;
    });
    await engine.initialize(dictionaries, { activeProperNouns: ['properNouns'] });
    return engine;
  }

  test('patterns loaded but WASM unavailable: the JS path from the first call, no toast', async () => {
    const engine = await initWith({
      wasmAvailable: false,
      patterns: [{ originalPattern: 'X的Y' }],
    });

    expect(engine.settings.enableTwoPhasePatterns).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/JavaScript pattern path/));
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('WASM available: the WASM path stays on', async () => {
    const engine = await initWith({ wasmAvailable: true, patterns: [{ originalPattern: 'X的Y' }] });
    expect(engine.settings.enableTwoPhasePatterns).toBe(true);
  });

  test('no patterns loaded: nothing to decide, the flag stays on', async () => {
    const engine = await initWith({ wasmAvailable: false, patterns: [] });
    expect(engine.settings.enableTwoPhasePatterns).toBe(true);
  });
});

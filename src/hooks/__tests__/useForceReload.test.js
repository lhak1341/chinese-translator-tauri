/**
 * Invariant tests for useForceReload.
 *
 * Primary focus: CRITICAL-3 and CRITICAL-1 ordering invariants.
 *
 * CRITICAL-3: ctx.cancelTranslations() must fully resolve before ctx.destroyEngine()
 *   is called. Violating this causes a race where the engine is destroyed while a
 *   translation is still writing to its internal state.
 *
 * CRITICAL-1: ctx.setReloading(false) fires only inside the finally block, AFTER
 *   ctx.restoreScrollPositions() resolves, so isDictionaryReloading stays true until
 *   scroll is fully restored.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForceReload } from '../useForceReload.js';
import { parallelDictionaryLoader } from '../../utils/dictionary';

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/TranslationEngine.js', () => ({
  DEBUG_LEVELS: { ERROR: 'error' },
}));
vi.mock('../../utils/dictionary', () => ({
  parallelDictionaryLoader: {
    loadDictionariesParallel: vi.fn().mockResolvedValue({
      results: [],
      duration: 0,
    }),
  },
}));

/** Build a minimal ctx with all 10 ForceReloadContext methods. */
function makeCtx(overrides = {}) {
  return {
    cancelTranslations: vi.fn().mockResolvedValue(undefined),
    destroyEngine: vi.fn(),
    setStatus: vi.fn(),
    setReloadError: vi.fn(),
    setReloading: vi.fn(),
    clearHighlighting: vi.fn(),
    reinitializeEngine: vi.fn().mockResolvedValue(true),
    retranslate: vi.fn().mockResolvedValue(undefined),
    saveScrollPositions: vi.fn().mockReturnValue({ top: 0 }),
    restoreScrollPositions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  global.window.electronAPI = {
    loadDictionary: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Early-return guard ────────────────────────────────────────────────────────

describe('useForceReload — early-return guard', () => {
  test('isDictionaryReloading=true → returns immediately, no work done', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, /* isDictionaryReloading */ true, 'text', false, {})
    );

    await act(async () => {
      await result.current();
    });

    expect(ctx.cancelTranslations).not.toHaveBeenCalled();
    expect(ctx.destroyEngine).not.toHaveBeenCalled();
    expect(ctx.setReloading).not.toHaveBeenCalled();
  });
});

// ── CRITICAL-3 invariant ──────────────────────────────────────────────────────

describe('CRITICAL-3: cancelTranslations resolves before destroyEngine fires', () => {
  test('destroyEngine not called before cancelTranslations Promise resolves', async () => {
    const sequence = [];

    // cancelTranslations returns a Promise that resolves in a microtask — not synchronously.
    // If the hook forgets to `await ctx.cancelTranslations()`, destroyEngine fires
    // before the microtask, so sequence would be ['destroy', 'cancel-resolved'] instead of
    // ['cancel-resolved', 'destroy'].
    const ctx = makeCtx({
      cancelTranslations: vi.fn(() =>
        Promise.resolve().then(() => {
          sequence.push('cancel-resolved');
        })
      ),
      destroyEngine: vi.fn(() => {
        sequence.push('destroy');
      }),
      reinitializeEngine: vi.fn().mockResolvedValue(false), // stop early so test stays fast
    });

    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));

    vi.useFakeTimers();
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(sequence).toContain('cancel-resolved');
    expect(sequence).toContain('destroy');
    expect(sequence.indexOf('cancel-resolved')).toBeLessThan(sequence.indexOf('destroy'));
  });

  test('cancelTranslations always called as first protocol step', async () => {
    const callOrder = [];
    const ctx = makeCtx({
      cancelTranslations: vi.fn(() => {
        callOrder.push('cancel');
        return Promise.resolve();
      }),
      destroyEngine: vi.fn(() => {
        callOrder.push('destroy');
      }),
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(callOrder[0]).toBe('cancel');
    expect(callOrder[1]).toBe('destroy');
  });
});

// ── CRITICAL-1 invariant ──────────────────────────────────────────────────────

describe('CRITICAL-1: setReloading(false) fires after restoreScrollPositions', () => {
  test('restoreScrollPositions resolves before setReloading(false) is called', async () => {
    const sequence = [];

    const ctx = makeCtx({
      restoreScrollPositions: vi.fn(async () => {
        sequence.push('restored');
      }),
      setReloading: vi.fn((b) => {
        if (!b) sequence.push('setReloading-false');
      }),
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(sequence).toContain('restored');
    expect(sequence).toContain('setReloading-false');
    expect(sequence.indexOf('restored')).toBeLessThan(sequence.indexOf('setReloading-false'));
  });

  test('setReloading(true) fires at the START; setReloading(false) fires in finally', async () => {
    const sequence = [];
    const ctx = makeCtx({
      setReloading: vi.fn((b) => {
        sequence.push(b ? 'setReloading-true' : 'setReloading-false');
      }),
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(sequence[0]).toBe('setReloading-true');
    expect(sequence[sequence.length - 1]).toBe('setReloading-false');
  });

  test('finally (setReloading-false) fires even when reinitializeEngine returns false', async () => {
    const ctx = makeCtx({
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    const calls = ctx.setReloading.mock.calls.map(([b]) => b);
    expect(calls).toContain(false);
  });

  test('finally fires even when the try block throws', async () => {
    const ctx = makeCtx({
      cancelTranslations: vi.fn().mockRejectedValue(new Error('cancel failed')),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    const calls = ctx.setReloading.mock.calls.map(([b]) => b);
    expect(calls).toContain(false);
  });
});

// ── reinitializeEngine returns false ─────────────────────────────────────────

describe('useForceReload — engine init failure', () => {
  test('setReloadError called when reinitializeEngine returns false', async () => {
    const ctx = makeCtx({
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.setReloadError).toHaveBeenCalledWith(
      expect.stringContaining('reinitializing engine')
    );
  });

  test('retranslate NOT called when engine init fails', async () => {
    const ctx = makeCtx({
      reinitializeEngine: vi.fn().mockResolvedValue(false),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, 'hello', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.retranslate).not.toHaveBeenCalled();
  });
});

// ── retranslate path ──────────────────────────────────────────────────────────

describe('useForceReload — retranslate path', () => {
  test('retranslate called with inputText when engine ready and text present', async () => {
    const ctx = makeCtx();

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, 'hello world', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.retranslate).toHaveBeenCalledWith('hello world');
  });

  test('retranslate NOT called when inputText is empty', async () => {
    const ctx = makeCtx();

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.retranslate).not.toHaveBeenCalled();
  });

  test('retranslate NOT called when inputText is whitespace only', async () => {
    const ctx = makeCtx();

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '   \n ', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.retranslate).not.toHaveBeenCalled();
  });

  test('setReloadError called when retranslate throws', async () => {
    const ctx = makeCtx({
      retranslate: vi.fn().mockRejectedValue(new Error('translate boom')),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, 'text', false, {}));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.setReloadError).toHaveBeenCalledWith(expect.stringContaining('translate boom'));
  });
});

// ── isLoading guard ───────────────────────────────────────────────────────────

describe('useForceReload — isLoading guard', () => {
  test('reinitializeEngine NOT called when isLoading=true', async () => {
    const ctx = makeCtx();

    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'text', /* isLoading */ true, {})
    );
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.reinitializeEngine).not.toHaveBeenCalled();
  });
});

// ── Fallback dictionary-load path (accumulateLoadResults parity) ───────────────

describe('useForceReload — parallelDictionaryLoader fallback path', () => {
  test('when loadDictionariesParallel rejects, the manual Promise.all fallback still builds freshDictionaries/successCount correctly', async () => {
    parallelDictionaryLoader.loadDictionariesParallel.mockRejectedValueOnce(
      new Error('loader unavailable')
    );

    global.window.electronAPI.loadDictionary = vi.fn((dictId) => {
      if (dictId === 'dictB') {
        return Promise.resolve({ success: false, error: 'boom' });
      }
      return Promise.resolve({ success: true, data: { 你好: 'xin chào' } });
    });

    const ctx = makeCtx();
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, '', false, { dictA: {}, dictB: {}, dictC: {} })
    );
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.reinitializeEngine).toHaveBeenCalledWith(
      { dictA: { 你好: 'xin chào' }, dictC: { 你好: 'xin chào' } },
      expect.objectContaining({ forceConfigReload: true })
    );
  });

  test('fallback path does not double-log a per-item failure (accumulateLoadResults is the sole logger)', async () => {
    const { logger } = await import('../../utils/logger');
    parallelDictionaryLoader.loadDictionariesParallel.mockRejectedValueOnce(
      new Error('loader unavailable')
    );
    global.window.electronAPI.loadDictionary = vi.fn().mockResolvedValue({
      success: false,
      error: 'boom',
    });

    const ctx = makeCtx();
    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, { dictA: {} }));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await done;

    const failureLogs = logger.error.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('dictA')
    );
    expect(failureLogs).toHaveLength(1);
  });
});

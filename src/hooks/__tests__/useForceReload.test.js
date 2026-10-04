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

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** The provider's `reloadAllDictionaries`: the Dictionary Store's reload of every dictionary. */
const reloadAll = vi.fn();

/** Build a minimal ctx with all 10 ForceReloadContext methods. */
function makeCtx(overrides = {}) {
  return {
    cancelTranslations: vi.fn().mockResolvedValue(undefined),
    destroyEngine: vi.fn(),
    setStatus: vi.fn(),
    setReloadError: vi.fn(),
    setReloading: vi.fn(),
    clearHighlighting: vi.fn(),
    reinitializeEngine: vi.fn().mockResolvedValue({ ok: true }),
    retranslate: vi.fn().mockResolvedValue(undefined),
    saveScrollPositions: vi.fn().mockReturnValue({ top: 0 }),
    restoreScrollPositions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reloadAll.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Early-return guard ────────────────────────────────────────────────────────

describe('useForceReload — early-return guard', () => {
  test('isDictionaryReloading=true → returns immediately, no work done', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, /* isDictionaryReloading */ true, 'text', false, reloadAll)
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
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }), // stop early so test stays fast
    });

    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));

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
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
  test('setReloadError carries the engine failure message', async () => {
    const ctx = makeCtx({
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(ctx.setReloadError).toHaveBeenCalledWith(expect.stringContaining('init boom'));
  });

  test('retranslate NOT called when engine init fails', async () => {
    const ctx = makeCtx({
      reinitializeEngine: vi.fn().mockResolvedValue({ ok: false, error: 'init boom' }),
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, 'hello', false, reloadAll));
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
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'hello world', false, reloadAll)
    );
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
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
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
    const { result } = renderHook(() => useForceReload(ctx, false, '   \n ', false, reloadAll));
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
    const { result } = renderHook(() => useForceReload(ctx, false, 'text', false, reloadAll));
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
      useForceReload(ctx, false, 'text', /* isLoading */ true, reloadAll)
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

// ── Reader-triggered reload: the retranslate step is deferred, not performed ──────

/**
 * A reload triggered from the Reader must not re-translate the Translator's own input.
 *
 * Every tab stays mounted, so the Translator is holding whatever was last pasted into it,
 * and re-translating a whole hidden document is the single most expensive thing a
 * Reader-triggered reload did. It is also not merely slow: `translateWithSegments` resets
 * engine-wide segment state on entry, and BookReader's engine queue is documented as
 * assuming the Translator never calls the engine while the Reader is driving it.
 */
describe('useForceReload — retranslateInput: false', () => {
  /** Run one reload to completion, including the scroll-restore timeout in `finally`. */
  async function runReload(result, options) {
    vi.useFakeTimers();
    const done = act(async () => {
      result.current(options);
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;
  }

  test('skips the retranslate step even when there is input to redo', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'hello world', false, reloadAll)
    );

    await runReload(result, { retranslateInput: false });

    expect(ctx.retranslate).not.toHaveBeenCalled();
  });

  test('still reloads and reinitializes — only the last step is skipped', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'hello world', false, reloadAll)
    );

    await runReload(result, { retranslateInput: false });

    expect(ctx.cancelTranslations).toHaveBeenCalled();
    expect(ctx.destroyEngine).toHaveBeenCalled();
    expect(ctx.reinitializeEngine).toHaveBeenCalled();
  });

  test('says the visible translation is stale rather than claiming it is current', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'hello world', false, reloadAll)
    );

    await runReload(result, { retranslateInput: false });

    const finalStatus = ctx.setStatus.mock.calls.at(-1)[0];
    expect(finalStatus).toContain('previous dictionaries');
  });

  test('defaults to retranslating when called with no options at all', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() =>
      useForceReload(ctx, false, 'hello world', false, reloadAll)
    );

    await runReload(result, undefined);

    expect(ctx.retranslate).toHaveBeenCalledWith('hello world');
  });

  test('empty input reports plain completion, not staleness', async () => {
    const ctx = makeCtx();
    const { result } = renderHook(() => useForceReload(ctx, false, '   ', false, reloadAll));

    await runReload(result, { retranslateInput: false });

    const finalStatus = ctx.setStatus.mock.calls.at(-1)[0];
    expect(finalStatus).not.toContain('previous dictionaries');
    expect(ctx.retranslate).not.toHaveBeenCalled();
  });
});

// ── Dictionaries come from the Dictionary Store ────────────────────────────────

describe('dictionaries come from the Dictionary Store (ADR-055)', () => {
  test('the engine is rebuilt from what the store reloaded, unread ones retried with the rest', async () => {
    const ctx = makeCtx();
    reloadAll.mockResolvedValue({ phrases: { 你好: 'xin chào' } });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(reloadAll).toHaveBeenCalledOnce();
    expect(ctx.reinitializeEngine).toHaveBeenCalledWith(
      { phrases: { 你好: 'xin chào' } },
      expect.objectContaining({ forceConfigReload: true })
    );
  });

  test('the store reloads only after translations stopped and the engine was destroyed', async () => {
    const order = [];
    const ctx = makeCtx({
      cancelTranslations: vi.fn(async () => order.push('cancel')),
      destroyEngine: vi.fn(() => order.push('destroy')),
    });
    reloadAll.mockImplementation(async () => {
      order.push('reload');
      return {};
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useForceReload(ctx, false, '', false, reloadAll));
    const done = act(async () => {
      result.current();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });
    await done;

    expect(order).toEqual(['cancel', 'destroy', 'reload']);
  });
});

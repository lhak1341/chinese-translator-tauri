import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTranslatorEngine } from '../useTranslatorEngine.js';
import { useDictionary } from '../../components/dictionary/DictionaryContext';
import { createTranslationEngine } from '../../utils/TranslationEngine.js';
import { loadAppConfig, invalidateAppConfig } from '../../utils/appConfig';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: vi.fn(),
}));

vi.mock('../../utils/TranslationEngine.js', () => ({
  createTranslationEngine: vi.fn(),
}));

vi.mock('../../utils/appConfig', () => ({
  loadAppConfig: vi.fn(),
  invalidateAppConfig: vi.fn(),
}));

function mockEngine(initializeImpl, destroyImpl) {
  let ready = false;
  const runInit = initializeImpl ?? (() => Promise.resolve());
  // Ready only once initialize resolves, as the real engine is.
  const initialize = vi.fn(async (...args) => {
    await runInit(...args);
    ready = true;
  });
  const destroy = vi.fn(destroyImpl ?? (() => {}));
  return { initialize, destroy, isReady: () => ready };
}

const hookParams = { getVisibleTab: () => 'reader' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDictionary).mockReturnValue({
    dictionaries: { properNouns: {} },
    isLoading: false,
    loadError: null,
  });
  vi.mocked(loadAppConfig).mockResolvedValue({
    engine: { activeProperNouns: ['properNouns'] },
    ui: {},
    session: {},
  });
  // mockReset, not clearAllMocks: a test's unconsumed mockReturnValueOnce must not leak on.
  vi.mocked(createTranslationEngine).mockReset().mockReturnValue(mockEngine());
});

describe('useTranslatorEngine — mount', () => {
  test('successful init reaches enginePhase "ready"', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));

    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));
    expect(result.current.initError).toBeNull();
  });

  test('engine.initialize() rejecting reaches enginePhase "error" with initError set', async () => {
    vi.mocked(createTranslationEngine).mockReturnValue(
      mockEngine(() => Promise.reject(new Error('init boom')))
    );

    const { result } = renderHook(() => useTranslatorEngine(hookParams));

    await waitFor(() => expect(result.current.enginePhase).toBe('error'));
    expect(result.current.initError).toBe('init boom');
  });
});

describe('useTranslatorEngine — reinitialize', () => {
  test('successful reinitialize reaches enginePhase "ready"', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });

    expect(result.current.enginePhase).toBe('ready');
    expect(createTranslationEngine).toHaveBeenCalledTimes(2);
  });

  test('engine.initialize() rejecting during reinitialize reaches enginePhase "error"', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    vi.mocked(createTranslationEngine).mockReturnValue(
      mockEngine(() => Promise.reject(new Error('reinit boom')))
    );

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });

    expect(result.current.enginePhase).toBe('error');
    expect(result.current.initError).toBe('reinit boom');
  });

  test('a config-reload failure lands in initError/enginePhase — reinitialize never throws', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    vi.mocked(loadAppConfig).mockRejectedValue(new Error('config read failed'));

    await expect(
      act(async () => {
        await result.current.reinitialize({ properNouns: {} }, { forceConfigReload: true });
      })
    ).resolves.not.toThrow();

    expect(result.current.enginePhase).toBe('error');
    expect(result.current.initError).toBe('config read failed');
  });

  test('forceConfigReload invalidates the cache and builds the engine with the fresh activeProperNouns', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    const rebuilt = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(rebuilt);
    vi.mocked(loadAppConfig).mockResolvedValue({
      engine: { activeProperNouns: ['properNouns', 'properNouns-Fresh'] },
      ui: {},
      session: {},
    });

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} }, { forceConfigReload: true });
    });

    expect(invalidateAppConfig).toHaveBeenCalledTimes(1);
    expect(rebuilt.initialize).toHaveBeenCalledWith(
      { properNouns: {} },
      expect.objectContaining({ activeProperNouns: ['properNouns', 'properNouns-Fresh'] })
    );
  });

  test('destroys the outgoing engine before constructing the replacement', async () => {
    const engine1 = mockEngine();
    const engine2 = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(engine1).mockReturnValueOnce(engine2);

    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));
    expect(result.current.engineRef.current).toBe(engine1);

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });

    expect(engine1.destroy).toHaveBeenCalledTimes(1);
    expect(engine2.destroy).not.toHaveBeenCalled();
    expect(result.current.engineRef.current).toBe(engine2);
    expect(result.current.enginePhase).toBe('ready');
  });

  test('a throwing destroy() on the outgoing engine does not block the replacement', async () => {
    const engine1 = mockEngine(undefined, () => {
      throw new Error('destroy boom');
    });
    const engine2 = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(engine1).mockReturnValueOnce(engine2);

    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });

    expect(engine1.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.engineRef.current).toBe(engine2);
    expect(result.current.enginePhase).toBe('ready');
    expect(result.current.initError).toBeNull();
  });

  test('resolves { ok: true } on success and { ok: false, error } on a failed init', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    let outcome;
    await act(async () => {
      outcome = await result.current.reinitialize({ properNouns: {} });
    });
    expect(outcome).toEqual({ ok: true });

    vi.mocked(createTranslationEngine).mockReturnValue(
      mockEngine(() => Promise.reject(new Error('reinit boom')))
    );
    await act(async () => {
      outcome = await result.current.reinitialize({ properNouns: {} });
    });
    expect(outcome).toEqual({ ok: false, error: 'reinit boom' });
  });

  test('a config-reload failure resolves { ok: false, error }', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));
    vi.mocked(loadAppConfig).mockRejectedValue(new Error('config read failed'));

    let outcome;
    await act(async () => {
      outcome = await result.current.reinitialize({ properNouns: {} }, { forceConfigReload: true });
    });
    expect(outcome).toEqual({ ok: false, error: 'config read failed' });
  });
});

describe('useTranslatorEngine — serialized init', () => {
  /** An engine whose initialize() settles when the test says so. */
  function gatedEngine() {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    return { engine: mockEngine(() => gate), release };
  }

  test('a call during an init waits for it, then runs with its own dictionaries', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    const first = gatedEngine();
    const second = mockEngine();
    vi.mocked(createTranslationEngine)
      .mockReturnValueOnce(first.engine)
      .mockReturnValueOnce(second);

    let firstOutcome;
    let secondOutcome;
    let both;
    act(() => {
      both = Promise.all([
        result.current.reinitialize({ a: 1 }).then((o) => (firstOutcome = o)),
        result.current.reinitialize({ b: 2 }).then((o) => (secondOutcome = o)),
      ]);
    });
    // The swap takes an engineAccess turn, so it starts a few microtasks after the call.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The second call is queued: only the first init has built an engine.
    expect(createTranslationEngine).toHaveBeenCalledTimes(2); // mount + first
    expect(second.initialize).not.toHaveBeenCalled();

    await act(async () => {
      first.release();
      await both;
    });

    expect(createTranslationEngine).toHaveBeenCalledTimes(3);
    expect(second.initialize).toHaveBeenCalledWith({ b: 2 }, expect.anything());
    expect(firstOutcome).toEqual({ ok: true });
    expect(secondOutcome).toEqual({ ok: true });
  });

  test('calls piled up behind an init collapse into one run with the latest arguments', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    const first = gatedEngine();
    const last = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(first.engine).mockReturnValueOnce(last);
    vi.mocked(loadAppConfig).mockResolvedValue({
      engine: { activeProperNouns: ['properNouns', 'properNouns-Fresh'] },
      ui: {},
      session: {},
    });

    const outcomes = [];
    let all;
    act(() => {
      all = Promise.all([
        result.current.reinitialize({ run: 1 }),
        result.current.reinitialize({ run: 2 }, { forceConfigReload: true }),
        result.current.reinitialize({ run: 3 }),
      ]).then((o) => outcomes.push(...o));
    });

    await act(async () => {
      first.release();
      await all;
    });

    // mount + first + ONE collapsed run — not one per call.
    expect(createTranslationEngine).toHaveBeenCalledTimes(3);
    expect(last.initialize).toHaveBeenCalledWith(
      { run: 3 },
      expect.objectContaining({ activeProperNouns: ['properNouns', 'properNouns-Fresh'] })
    );
    // forceConfigReload from the earlier call survived the later one that omitted it.
    expect(invalidateAppConfig).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  });

  test('a rebuild requested during the mount init is not dropped', async () => {
    const mounting = gatedEngine();
    const rebuilt = mockEngine();
    vi.mocked(createTranslationEngine)
      .mockReturnValueOnce(mounting.engine)
      .mockReturnValueOnce(rebuilt);

    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(mounting.engine.initialize).toHaveBeenCalled());

    let outcome;
    let pending;
    act(() => {
      pending = result.current.reinitialize({ fresh: true }).then((o) => (outcome = o));
    });
    await act(async () => {
      mounting.release();
      await pending;
    });

    expect(rebuilt.initialize).toHaveBeenCalledWith({ fresh: true }, expect.anything());
    expect(outcome).toEqual({ ok: true });
    expect(result.current.engineRef.current).toBe(rebuilt);
  });
});

describe('useTranslatorEngine — destroyEngine', () => {
  test('destroys the live engine and clears the ref when idle', async () => {
    const engine = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(engine);
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    act(() => {
      result.current.destroyEngine();
    });

    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.engineRef.current).toBeNull();
  });

  test('a destroy() that throws is caught, and the ref keeps the engine', async () => {
    const engine = mockEngine(undefined, () => {
      throw new Error('boom');
    });
    vi.mocked(createTranslationEngine).mockReturnValueOnce(engine);
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    expect(() => act(() => result.current.destroyEngine())).not.toThrow();
    expect(result.current.engineRef.current).toBe(engine);
  });

  test('leaves an engine that is still initializing alone — the queued rebuild replaces it', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    let release;
    const building = mockEngine(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const rebuilt = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(building).mockReturnValueOnce(rebuilt);

    let pending;
    act(() => {
      pending = result.current.reinitialize({ properNouns: {} });
    });
    // The swap takes an engineAccess turn, so it starts a few microtasks after the call.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      result.current.destroyEngine();
    });

    expect(building.destroy).not.toHaveBeenCalled();
    expect(result.current.engineRef.current).toBe(building);

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.enginePhase).toBe('ready');
    expect(result.current.engineRef.current).toBe(building);
  });
});

describe('useTranslatorEngine — the swap waits for the engine call in flight', () => {
  test('a rebuild destroys the outgoing engine only after a running call finishes on it', async () => {
    const outgoing = mockEngine();
    const replacement = mockEngine();
    vi.mocked(createTranslationEngine)
      .mockReturnValueOnce(outgoing)
      .mockReturnValueOnce(replacement);
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    let finishCall;
    const destroyedDuringCall = [];
    const call = result.current.engineAccess.run('reader', async (engine) => {
      await new Promise((resolve) => {
        finishCall = resolve;
      });
      destroyedDuringCall.push(engine.destroy.mock.calls.length);
      return engine;
    });
    let pending;
    act(() => {
      pending = result.current.reinitialize({ properNouns: {} });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(outgoing.destroy).not.toHaveBeenCalled();
    expect(createTranslationEngine).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishCall();
      await pending;
    });
    expect(await call).toBe(outgoing);
    expect(destroyedDuringCall).toEqual([0]);
    expect(outgoing.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.engineRef.current).toBe(replacement);
  });

  test('a call made while the replacement initializes runs on it once ready, not refused', async () => {
    const { result } = renderHook(() => useTranslatorEngine(hookParams));
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    let release;
    const building = mockEngine(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    vi.mocked(createTranslationEngine).mockReturnValueOnce(building);

    let pending;
    act(() => {
      pending = result.current.reinitialize({ properNouns: {} });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const call = result.current.engineAccess.run('reader', async (engine) => engine);

    await act(async () => {
      release();
      await pending;
    });
    await expect(call).resolves.toBe(building);
  });
});

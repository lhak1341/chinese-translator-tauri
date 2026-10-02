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
  DEBUG_LEVELS: { ERROR: 0 },
}));

vi.mock('../../utils/appConfig', () => ({
  loadAppConfig: vi.fn(),
  invalidateAppConfig: vi.fn(),
}));

function mockEngine(initializeImpl, destroyImpl) {
  const initialize = vi.fn(initializeImpl ?? (() => Promise.resolve()));
  const destroy = vi.fn(destroyImpl ?? (() => {}));
  return { initialize, destroy };
}

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
  vi.mocked(createTranslationEngine).mockReturnValue(mockEngine());
});

describe('useTranslatorEngine — mount', () => {
  test('successful init reaches enginePhase "ready"', async () => {
    const { result } = renderHook(() => useTranslatorEngine());

    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));
    expect(result.current.initError).toBeNull();
  });

  test('engine.initialize() rejecting reaches enginePhase "error" with initError set', async () => {
    vi.mocked(createTranslationEngine).mockReturnValue(
      mockEngine(() => Promise.reject(new Error('init boom')))
    );

    const { result } = renderHook(() => useTranslatorEngine());

    await waitFor(() => expect(result.current.enginePhase).toBe('error'));
    expect(result.current.initError).toBe('init boom');
  });
});

describe('useTranslatorEngine — reinitialize', () => {
  test('successful reinitialize reaches enginePhase "ready"', async () => {
    const { result } = renderHook(() => useTranslatorEngine());
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });

    expect(result.current.enginePhase).toBe('ready');
    expect(createTranslationEngine).toHaveBeenCalledTimes(2);
  });

  test('engine.initialize() rejecting during reinitialize reaches enginePhase "error"', async () => {
    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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

  test('forceConfigReload invalidates the cache and adopts the fresh activeProperNouns', async () => {
    const { result } = renderHook(() => useTranslatorEngine());
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    vi.mocked(loadAppConfig).mockResolvedValue({
      engine: { activeProperNouns: ['properNouns', 'properNouns-Fresh'] },
      ui: {},
      session: {},
    });

    await act(async () => {
      await result.current.reinitialize({ properNouns: {} }, { forceConfigReload: true });
    });

    expect(invalidateAppConfig).toHaveBeenCalledTimes(1);
    expect(result.current.activeProperNounsFromConfig).toEqual([
      'properNouns',
      'properNouns-Fresh',
    ]);
  });

  test('destroys the outgoing engine before constructing the replacement', async () => {
    const engine1 = mockEngine();
    const engine2 = mockEngine();
    vi.mocked(createTranslationEngine).mockReturnValueOnce(engine1).mockReturnValueOnce(engine2);

    const { result } = renderHook(() => useTranslatorEngine());
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

    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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

    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
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
    const { result } = renderHook(() => useTranslatorEngine());
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    expect(() => act(() => result.current.destroyEngine())).not.toThrow();
    expect(result.current.engineRef.current).toBe(engine);
  });

  test('leaves an engine that is still initializing alone — the queued rebuild replaces it', async () => {
    const { result } = renderHook(() => useTranslatorEngine());
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

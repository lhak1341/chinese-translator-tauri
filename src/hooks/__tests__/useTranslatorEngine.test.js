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

function mockEngine(initializeImpl) {
  const initialize = vi.fn(initializeImpl ?? (() => Promise.resolve()));
  return { initialize };
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

  test('re-entrancy guard: a concurrent reinitialize call while one is in flight is a no-op', async () => {
    const { result } = renderHook(() => useTranslatorEngine());
    await waitFor(() => expect(result.current.enginePhase).toBe('ready'));

    let resolveInit;
    vi.mocked(createTranslationEngine).mockReturnValue(
      mockEngine(
        () =>
          new Promise((resolve) => {
            resolveInit = resolve;
          })
      )
    );

    let firstCallDone = false;
    const firstCall = act(async () => {
      const p = result.current.reinitialize({ properNouns: {} });
      await Promise.resolve(); // let the in-flight call set isInitializingRef before the second call
      await p.then(() => {
        firstCallDone = true;
      });
    });

    // second call issued while the first is still awaiting engine.initialize()
    await act(async () => {
      await result.current.reinitialize({ properNouns: {} });
    });
    expect(createTranslationEngine).toHaveBeenCalledTimes(2); // once from mount, once from first reinitialize

    resolveInit();
    await firstCall;
    expect(firstCallDone).toBe(true);
  });
});

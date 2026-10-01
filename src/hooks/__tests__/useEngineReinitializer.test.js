/**
 * Tests for useEngineReinitializer — extracted from Translator.jsx's forceReloadCtx
 * (2026-07-17c) so this logic gets exercised directly.
 */
import { describe, test, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngineReinitializer } from '../useEngineReinitializer.js';

function makeEngineRef(overrides = {}) {
  return { current: { isReady: () => true, ...overrides } };
}

describe('useEngineReinitializer', () => {
  test('calls reinitialize with the given dicts and opts', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({ phrases: {} }, { forceConfigReload: true, debugLevel: 'error' });
    });

    expect(reinitialize).toHaveBeenCalledWith(
      { phrases: {} },
      { forceConfigReload: true, debugLevel: 'error' }
    );
  });

  test('returns true when the engine is ready after reinitialize', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    let outcome;
    await act(async () => {
      outcome = await result.current({}, {});
    });

    expect(outcome).toBe(true);
  });

  test('returns false when engine is not ready after reinitialize', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef({ isReady: () => false });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    let outcome;
    await act(async () => {
      outcome = await result.current({}, {});
    });

    expect(outcome).toBe(false);
  });

  test('returns false when there is no engine', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, { current: null }));

    let outcome;
    await act(async () => {
      outcome = await result.current({}, {});
    });

    expect(outcome).toBe(false);
  });
});

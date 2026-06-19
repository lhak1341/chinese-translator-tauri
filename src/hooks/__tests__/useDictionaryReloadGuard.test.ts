import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictionaryReloadGuard } from '../useDictionaryReloadGuard';

describe('useDictionaryReloadGuard', () => {
  it('starts with isDictionaryReloading false', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    expect(result.current.isDictionaryReloading).toBe(false);
  });

  it('setDictionaryReloading(true) sets the flag', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    act(() => result.current.setDictionaryReloading(true));
    expect(result.current.isDictionaryReloading).toBe(true);
  });

  it('setDictionaryReloading(false) clears the flag', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    act(() => result.current.setDictionaryReloading(true));
    act(() => result.current.setDictionaryReloading(false));
    expect(result.current.isDictionaryReloading).toBe(false);
  });
});

// ─── consumeReloadTransition ──────────────────────────────────────────────────

describe('consumeReloadTransition', () => {
  it('returns false when no reload has occurred', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    expect(result.current.consumeReloadTransition()).toBe(false);
  });

  it('returns false while reload is in progress (prev=false, current=true)', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    act(() => result.current.setDictionaryReloading(true));
    expect(result.current.consumeReloadTransition()).toBe(false);
  });

  it('returns true on the first call after reload completes', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    act(() => result.current.setDictionaryReloading(true));
    result.current.consumeReloadTransition(); // consume the false during-reload call
    act(() => result.current.setDictionaryReloading(false));
    expect(result.current.consumeReloadTransition()).toBe(true);
  });

  it('returns false on subsequent calls after the transition is consumed', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());
    act(() => result.current.setDictionaryReloading(true));
    result.current.consumeReloadTransition();
    act(() => result.current.setDictionaryReloading(false));
    result.current.consumeReloadTransition(); // consumes it
    expect(result.current.consumeReloadTransition()).toBe(false);
    expect(result.current.consumeReloadTransition()).toBe(false);
  });

  it('detects exactly one transition per reload cycle', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());

    const transitions: boolean[] = [];
    const sample = () => transitions.push(result.current.consumeReloadTransition());

    sample(); // initial: false
    act(() => result.current.setDictionaryReloading(true));
    sample(); // during reload: false
    act(() => result.current.setDictionaryReloading(false));
    sample(); // just finished: true
    sample(); // consumed: false

    expect(transitions).toEqual([false, false, true, false]);
  });

  it('detects transitions across multiple reload cycles', () => {
    const { result } = renderHook(() => useDictionaryReloadGuard());

    const transitions: boolean[] = [];
    const sample = () => transitions.push(result.current.consumeReloadTransition());

    // Cycle 1
    act(() => result.current.setDictionaryReloading(true));
    sample(); // during: false
    act(() => result.current.setDictionaryReloading(false));
    sample(); // finished: true
    sample(); // consumed: false

    // Cycle 2
    act(() => result.current.setDictionaryReloading(true));
    sample(); // during: false
    act(() => result.current.setDictionaryReloading(false));
    sample(); // finished: true
    sample(); // consumed: false

    expect(transitions).toEqual([false, true, false, false, true, false]);
  });

  it('consumeReloadTransition is a stable function reference across renders', () => {
    const { result, rerender } = renderHook(() => useDictionaryReloadGuard());
    const ref1 = result.current.consumeReloadTransition;
    rerender();
    expect(result.current.consumeReloadTransition).toBe(ref1);
  });
});

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  callWasmWithTimeout,
  createTimeoutWrapper,
  TimeoutError,
  TimeoutManager,
  DEFAULT_WASM_TIMEOUTS,
} from '../wasmOperationTimeout';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a promise that resolves after `ms` real milliseconds. */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An operation that resolves immediately with `value`. */
function immediateOp(value = 'result') {
  return () => Promise.resolve(value);
}

/** An operation that rejects immediately with `error`. */
function failingOp(error = new Error('op failed')) {
  return () => Promise.reject(error);
}

/** An operation that never resolves (hangs forever). */
function hangingOp() {
  return () => new Promise(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// callWasmWithTimeout
// ─────────────────────────────────────────────────────────────────────────────

describe('callWasmWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Success path ─────────────────────────────────────────────────────────

  test('returns the operation result when it completes before the timeout', async () => {
    const promise = callWasmWithTimeout(immediateOp('hello'), 5000, 'test-op');
    // Flush the immediately-resolved microtask
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello');
  });

  test('clears the timeout timer when operation completes before deadline (bug regression)', async () => {
    // This is the exact bug that was fixed: timeoutId was inside the Promise
    // constructor so clearTimeout was never called, leaking a live timer on
    // every successful WASM call.
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const promise = callWasmWithTimeout(immediateOp('ok'), 5000, 'test-op');
    await vi.runAllTimersAsync();
    await promise;

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // ── Timeout path ─────────────────────────────────────────────────────────

  test('throws TimeoutError when the operation exceeds the deadline', async () => {
    const promise = callWasmWithTimeout(hangingOp(), 1000, 'slow-op');
    vi.advanceTimersByTime(1001);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  test('TimeoutError carries the operation name and timeout duration', async () => {
    const promise = callWasmWithTimeout(hangingOp(), 2000, 'my-operation');
    vi.advanceTimersByTime(2001);

    let caught;
    try {
      await promise;
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(TimeoutError);
    expect(caught.operation).toBe('my-operation');
    expect(caught.timeoutMs).toBe(2000);
    expect(caught.message).toContain('my-operation');
    expect(caught.message).toContain('2000');
    expect(caught.name).toBe('TimeoutError');
  });

  test('does not throw when operation completes just before the deadline', async () => {
    const promise = callWasmWithTimeout(immediateOp('fast'), 1000, 'fast-op');
    // Do NOT advance the timer — operation already resolved
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('fast');
  });

  // ── Error path ────────────────────────────────────────────────────────────

  test('re-throws non-timeout errors from the operation', async () => {
    // failingOp() rejects immediately via microtask; do NOT advance fake timers
    // here because runAllTimersAsync() would fire the 5 s timeout before the
    // microtask queue processes the rejection, creating an unhandled rejection.
    const opError = new Error('WASM segfault');
    const promise = callWasmWithTimeout(failingOp(opError), 5000, 'failing-op');
    await expect(promise).rejects.toThrow('WASM segfault');
  });

  test('non-timeout errors are not wrapped in TimeoutError', async () => {
    const promise = callWasmWithTimeout(failingOp(new Error('raw')), 5000, 'op');

    let caught;
    try {
      await promise;
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(TimeoutError);
  });

  test('clears the timeout timer even when the operation throws (bug regression)', async () => {
    // The bug: timeoutId was assigned inside the Promise constructor, so
    // clearTimeout was never actually called. Verify the fix holds.
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    // failingOp rejects immediately — clearTimeout should fire via the catch
    // block without needing to advance fake timers.
    const promise = callWasmWithTimeout(failingOp(), 5000, 'failing-op');
    try {
      await promise;
    } catch {}

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // ── throwOnTimeout: false ─────────────────────────────────────────────────

  test('returns fallbackValue instead of throwing when throwOnTimeout is false', async () => {
    const promise = callWasmWithTimeout(hangingOp(), 1000, 'hanging-op', {
      throwOnTimeout: false,
      fallbackValue: 'fallback',
    });
    vi.advanceTimersByTime(1001);
    await expect(promise).resolves.toBe('fallback');
  });

  test('fallbackValue defaults to null', async () => {
    const promise = callWasmWithTimeout(hangingOp(), 1000, 'op', {
      throwOnTimeout: false,
    });
    vi.advanceTimersByTime(1001);
    await expect(promise).resolves.toBeNull();
  });

  // ── DEFAULT_WASM_TIMEOUTS ─────────────────────────────────────────────────

  test('DEFAULT_WASM_TIMEOUTS exports expected keys', () => {
    expect(DEFAULT_WASM_TIMEOUTS).toHaveProperty('INITIALIZATION');
    expect(DEFAULT_WASM_TIMEOUTS).toHaveProperty('DICTIONARY_LOAD');
    expect(DEFAULT_WASM_TIMEOUTS).toHaveProperty('TOKEN_PROCESSING');
    expect(DEFAULT_WASM_TIMEOUTS).toHaveProperty('PATTERN_MATCHING');
    expect(DEFAULT_WASM_TIMEOUTS).toHaveProperty('NUMBER_CONVERSION');
  });

  test('DEFAULT_WASM_TIMEOUTS values are positive numbers', () => {
    Object.values(DEFAULT_WASM_TIMEOUTS).forEach((ms) => {
      expect(typeof ms).toBe('number');
      expect(ms).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createTimeoutWrapper
// ─────────────────────────────────────────────────────────────────────────────

describe('createTimeoutWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('wraps a function and returns a function', () => {
    const wrapped = createTimeoutWrapper(async () => 'ok', 5000, 'wrapped');
    expect(typeof wrapped).toBe('function');
  });

  test('wrapped function resolves with the original return value', async () => {
    const original = async (x) => x * 2;
    const wrapped = createTimeoutWrapper(original, 5000, 'double');
    const result = wrapped(21);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(42);
  });

  test('wrapped function throws TimeoutError when underlying call hangs', async () => {
    const hanging = () => new Promise(() => {});
    const wrapped = createTimeoutWrapper(hanging, 500, 'hanging-wrapped');
    const promise = wrapped();
    vi.advanceTimersByTime(501);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TimeoutManager
// ─────────────────────────────────────────────────────────────────────────────

describe('TimeoutManager', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new TimeoutManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('starts with zero stats', () => {
    const stats = manager.getStats();
    expect(stats.totalOperations).toBe(0);
    expect(stats.timedOutOperations).toBe(0);
    expect(stats.timeoutRate).toBe('0.00%');
  });

  test('increments totalOperations on each call', async () => {
    const p1 = manager.executeWithTimeout(immediateOp(), 5000, 'op1');
    await vi.runAllTimersAsync();
    await p1;

    const p2 = manager.executeWithTimeout(immediateOp(), 5000, 'op2');
    await vi.runAllTimersAsync();
    await p2;

    expect(manager.getStats().totalOperations).toBe(2);
  });

  test('increments timedOutOperations when a call times out', async () => {
    const promise = manager.executeWithTimeout(hangingOp(), 1000, 'slow');
    vi.advanceTimersByTime(1001);
    try {
      await promise;
    } catch {}

    const stats = manager.getStats();
    expect(stats.timedOutOperations).toBe(1);
    expect(stats.totalOperations).toBe(1);
  });

  test('tracks timeouts by operation name', async () => {
    const promise = manager.executeWithTimeout(hangingOp(), 1000, 'expensive-op');
    vi.advanceTimersByTime(1001);
    try {
      await promise;
    } catch {}

    const stats = manager.getStats();
    expect(stats.timeoutsByOperation['expensive-op']).toBe(1);
  });

  test('calculates timeoutRate correctly', async () => {
    // 1 success
    const p1 = manager.executeWithTimeout(immediateOp(), 5000, 'fast');
    await vi.runAllTimersAsync();
    await p1;

    // 1 timeout
    const p2 = manager.executeWithTimeout(hangingOp(), 1000, 'slow');
    vi.advanceTimersByTime(1001);
    try {
      await p2;
    } catch {}

    const stats = manager.getStats();
    expect(stats.timeoutRate).toBe('50.00%');
  });

  test('resetStats clears all counters', async () => {
    const p = manager.executeWithTimeout(hangingOp(), 1000, 'op');
    vi.advanceTimersByTime(1001);
    try {
      await p;
    } catch {}

    manager.resetStats();
    const stats = manager.getStats();
    expect(stats.totalOperations).toBe(0);
    expect(stats.timedOutOperations).toBe(0);
    expect(Object.keys(stats.timeoutsByOperation)).toHaveLength(0);
  });
});

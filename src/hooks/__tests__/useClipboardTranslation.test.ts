/**
 * Invariant tests for useClipboardTranslation.
 *
 *   I1 (ordering): isClipboardTranslationRef.current is set to true BEFORE setInputText is
 *      called. useAutoTranslateTrigger reads the ref after the inputText change triggers it;
 *      if the flag were set after, it would miss the clipboard context.
 *
 *   I2 (busy debounce): a second concurrent call while the first is in flight is dropped.
 *      readClipboard must be called exactly once.
 *
 *   I3 (reload guard): when isDictionaryReloading is true, a warning toast fires and
 *      readClipboard is not called.
 *
 *   I4 (error path): when readClipboard rejects, setInputText is not called and
 *      isClipboardTranslationRef.current stays false (flag was never set).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboardTranslation } from '../useClipboardTranslation';
import toast from '../../utils/toast';

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockReadClipboard = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockReadClipboard.mockResolvedValue('你好世界');
  Object.defineProperty(window, 'electronAPI', {
    value: { readClipboard: mockReadClipboard },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeHook(
  overrides: {
    isDictionaryReloading?: boolean;
    setInputText?: ReturnType<typeof vi.fn>;
    clearHighlighting?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const setInputText = overrides.setInputText ?? vi.fn();
  const clearHighlighting = overrides.clearHighlighting ?? vi.fn();
  const { result } = renderHook(() =>
    useClipboardTranslation({
      setInputText,
      isDictionaryReloading: overrides.isDictionaryReloading ?? false,
      clearHighlighting,
      originalTextRef: { current: null },
    })
  );
  return { result, setInputText, clearHighlighting };
}

// ─── I1: Ordering ─────────────────────────────────────────────────────────────

describe('I1 — ordering: flag set before setInputText', () => {
  it('isClipboardTranslationRef is true when setInputText is called', async () => {
    const setInputText = vi.fn();
    const { result } = renderHook(() =>
      useClipboardTranslation({
        setInputText,
        isDictionaryReloading: false,
        clearHighlighting: vi.fn(),
        originalTextRef: { current: null },
      })
    );

    let refValueAtCall: boolean | undefined;
    setInputText.mockImplementation(() => {
      refValueAtCall = result.current.isClipboardTranslationRef.current;
    });

    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });

    expect(refValueAtCall).toBe(true);
  });

  it('isClipboardTranslationRef stays true after handleTranslateFromClipboard (external reset)', async () => {
    const { result } = makeHook();
    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });
    expect(result.current.isClipboardTranslationRef.current).toBe(true);
  });

  it('resetClipboardFlag clears isClipboardTranslationRef', async () => {
    const { result } = makeHook();
    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });
    result.current.resetClipboardFlag();
    expect(result.current.isClipboardTranslationRef.current).toBe(false);
  });
});

// ─── I2: Busy debounce ────────────────────────────────────────────────────────

describe('I2 — busy debounce: concurrent call dropped', () => {
  it('readClipboard called once when two calls fire without awaiting between', async () => {
    const { result } = makeHook();

    await act(async () => {
      const p1 = result.current.handleTranslateFromClipboard();
      const p2 = result.current.handleTranslateFromClipboard();
      await Promise.all([p1, p2]);
    });

    expect(mockReadClipboard).toHaveBeenCalledTimes(1);
  });

  it('setInputText called once (not twice) during concurrent calls', async () => {
    const { result, setInputText } = makeHook();

    await act(async () => {
      const p1 = result.current.handleTranslateFromClipboard();
      const p2 = result.current.handleTranslateFromClipboard();
      await Promise.all([p1, p2]);
    });

    expect(setInputText).toHaveBeenCalledTimes(1);
  });
});

// ─── I3: Reload guard ─────────────────────────────────────────────────────────

describe('I3 — reload guard: isDictionaryReloading blocks clipboard read', () => {
  it('skips readClipboard and toasts warning', async () => {
    const { result } = makeHook({ isDictionaryReloading: true });

    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });

    expect(mockReadClipboard).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'Dictionary reload in progress. Please wait.',
      { duration: 3000 }
    );
  });

  it('does not set isClipboardTranslationRef when reload guard fires', async () => {
    const { result } = makeHook({ isDictionaryReloading: true });

    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });

    expect(result.current.isClipboardTranslationRef.current).toBe(false);
  });
});

// ─── I4: Error path ───────────────────────────────────────────────────────────

describe('I4 — error path: readClipboard failure leaves state clean', () => {
  it('setInputText not called on readClipboard rejection', async () => {
    mockReadClipboard.mockRejectedValue(new Error('clipboard denied'));
    const { result, setInputText } = makeHook();

    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });

    expect(setInputText).not.toHaveBeenCalled();
  });

  it('isClipboardTranslationRef stays false on readClipboard rejection', async () => {
    mockReadClipboard.mockRejectedValue(new Error('clipboard denied'));
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleTranslateFromClipboard();
    });

    expect(result.current.isClipboardTranslationRef.current).toBe(false);
  });
});

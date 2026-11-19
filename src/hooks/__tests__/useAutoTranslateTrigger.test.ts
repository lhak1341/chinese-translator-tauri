import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoTranslateTrigger, TranslationExecutionContext } from '../useAutoTranslateTrigger';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import resolution.
// toast re-exports from ToastContext (React); logger is side-effect-free.
// ---------------------------------------------------------------------------

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

import toast from '../../utils/toast';
const mockToast = toast as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

// ---------------------------------------------------------------------------
// Fixtures — factories so each test gets isolated mocks.
// Refs are plain objects (not React.createRef) — sufficient for reading .current.
// ---------------------------------------------------------------------------

const SHORT_TEXT = '你好'; // length 2 — below LARGE_TRANSLATION_THRESHOLD (1000)
const LONG_TEXT = 'a'.repeat(1001); // above threshold

function makeCtx(
  overrides: Partial<TranslationExecutionContext> = {}
): TranslationExecutionContext {
  return {
    consumeReloadTransition: vi.fn().mockReturnValue(false),
    clearHighlighting: vi.fn(),
    setIsTranslating: vi.fn(),
    setResultArrays: vi.fn(),
    setStreamingText: vi.fn(),
    isClipboardTranslationRef: { current: false },
    resetClipboardFlag: vi.fn(),
    translationTextRef: { current: null },
    ...overrides,
  };
}

const done = (text: string) => ({ status: 'done' as const, text });

function makeProps(overrides: Partial<Parameters<typeof useAutoTranslateTrigger>[0]> = {}) {
  return {
    inputText: SHORT_TEXT,
    isLoading: false,
    isDictionaryReloading: false,
    translateText: vi.fn().mockResolvedValue(done('Xin chào')),
    translateCharacterOnly: vi.fn(),
    ctx: makeCtx(),
    ...overrides,
  };
}

async function renderAndFlush(props: Parameters<typeof useAutoTranslateTrigger>[0]) {
  const handle = renderHook(() => useAutoTranslateTrigger(props));
  await act(async () => {}); // drain the async run() Promise
  return handle;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('guard: consumeReloadTransition', () => {
  it('returns early — translateText not called, isTranslating never set', async () => {
    const ctx = makeCtx({ consumeReloadTransition: vi.fn().mockReturnValue(true) });
    const props = makeProps({ ctx });
    await renderAndFlush(props);
    expect(props.translateText).not.toHaveBeenCalled();
    expect(ctx.setIsTranslating).not.toHaveBeenCalled();
  });

  it('clears nothing when returning early via consumeReloadTransition', async () => {
    const ctx = makeCtx({ consumeReloadTransition: vi.fn().mockReturnValue(true) });
    await renderAndFlush(makeProps({ ctx }));
    expect(ctx.clearHighlighting).not.toHaveBeenCalled();
  });
});

describe('guard: isDictionaryReloading', () => {
  it('returns early — translateText not called', async () => {
    const ctx = makeCtx();
    const props = makeProps({ isDictionaryReloading: true, ctx });
    await renderAndFlush(props);
    expect(props.translateText).not.toHaveBeenCalled();
    expect(ctx.setIsTranslating).not.toHaveBeenCalled();
  });
});

describe('guard: ordering invariant', () => {
  // consumeReloadTransition must be called BEFORE the isDictionaryReloading check.
  // If the guard order is swapped, consumeReloadTransition would not be called when
  // isDictionaryReloading=true causes an early return.
  it('consumeReloadTransition called when both guards are true', async () => {
    const ctx = makeCtx({ consumeReloadTransition: vi.fn().mockReturnValue(true) });
    const props = makeProps({ isDictionaryReloading: true, ctx });
    await renderAndFlush(props);
    expect(ctx.consumeReloadTransition).toHaveBeenCalledOnce();
    expect(props.translateText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No-op branch — guards pass but no translation runs
// ---------------------------------------------------------------------------

describe('no-op branch', () => {
  it('empty inputText → clearHighlighting×1, translateText not called', async () => {
    const ctx = makeCtx();
    await renderAndFlush(makeProps({ inputText: '', ctx }));
    expect(ctx.clearHighlighting).toHaveBeenCalledTimes(1);
    expect(makeProps().translateText).not.toHaveBeenCalled();
    expect(ctx.setIsTranslating).not.toHaveBeenCalled();
  });

  it('isLoading=true → clearHighlighting×1, translateText not called', async () => {
    const ctx = makeCtx();
    const props = makeProps({ isLoading: true, ctx });
    await renderAndFlush(props);
    expect(ctx.clearHighlighting).toHaveBeenCalledTimes(1);
    expect(props.translateText).not.toHaveBeenCalled();
    expect(ctx.setIsTranslating).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('happy path', () => {
  it('setResultArrays(null,[]) fires before translateText', async () => {
    const callOrder: string[] = [];
    const translateText = vi.fn().mockImplementation(() => {
      callOrder.push('translateText');
      return Promise.resolve(done('result'));
    });
    const ctx = makeCtx({
      setResultArrays: vi.fn().mockImplementation(() => callOrder.push('setResultArrays')),
    });
    await renderAndFlush(makeProps({ translateText, ctx }));
    expect(callOrder.indexOf('setResultArrays')).toBeLessThan(callOrder.indexOf('translateText'));
  });

  it('clearHighlighting called twice in translation branch', async () => {
    // First call: unconditional clear after guards (line 76).
    // Second call: explicit clear before setIsTranslating (line 80) — "clear previous highlighting".
    const ctx = makeCtx();
    await renderAndFlush(makeProps({ ctx }));
    expect(ctx.clearHighlighting).toHaveBeenCalledTimes(2);
  });

  it('setIsTranslating(true) before translate, setIsTranslating(false) in finally', async () => {
    const callOrder: string[] = [];
    const translateText = vi.fn().mockImplementation(() => {
      callOrder.push('translate');
      return Promise.resolve(done('done'));
    });
    const ctx = makeCtx({
      setIsTranslating: vi
        .fn()
        .mockImplementation((v: boolean) =>
          callOrder.push(v ? 'translating:true' : 'translating:false')
        ),
    });
    await renderAndFlush(makeProps({ translateText, ctx }));
    expect(callOrder).toEqual(['translating:true', 'translate', 'translating:false']);
  });

  it('setStreamingText called with resolved translation value', async () => {
    const ctx = makeCtx();
    const translateText = vi.fn().mockResolvedValue(done('Thật tuyệt'));
    await renderAndFlush(makeProps({ translateText, ctx }));
    expect(ctx.setStreamingText).toHaveBeenCalledWith('Thật tuyệt');
  });
});

// ---------------------------------------------------------------------------
// A skipped run: translateText already told the user why, so nothing else happens
// ---------------------------------------------------------------------------

describe('skipped translation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function renderSkipped(clipboard = false) {
    const ctx = makeCtx({ isClipboardTranslationRef: { current: clipboard } });
    const props = makeProps({
      ctx,
      translateText: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'preempted' }),
    });
    await renderAndFlush(props);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    return { ctx, props };
  }

  it('shows no error toast of its own', async () => {
    await renderSkipped();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('streams nothing and queues no character-only pass', async () => {
    const { ctx, props } = await renderSkipped();
    expect(ctx.setStreamingText).not.toHaveBeenCalled();
    expect(props.translateCharacterOnly).not.toHaveBeenCalled();
  });

  it('still ends the isTranslating state', async () => {
    const { ctx } = await renderSkipped();
    expect(ctx.setIsTranslating).toHaveBeenLastCalledWith(false);
  });

  it('resets the clipboard flag, since that attempt is over', async () => {
    const { ctx } = await renderSkipped(true);
    expect(ctx.resetClipboardFlag).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timers — charOnly (setTimeout 0) and clipboard scroll (setTimeout 100)
// ---------------------------------------------------------------------------

describe('timers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('translateCharacterOnly fires after setTimeout(0), not before', async () => {
    const translateCharacterOnly = vi.fn();
    const props = makeProps({ translateCharacterOnly });
    renderHook(() => useAutoTranslateTrigger(props));

    // flush async run() — translateCharacterOnly not yet called (timer pending)
    await act(async () => {});
    expect(translateCharacterOnly).not.toHaveBeenCalled();

    // advance past the 0ms timer
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(translateCharacterOnly).toHaveBeenCalledOnce();
    expect(translateCharacterOnly).toHaveBeenCalledWith(SHORT_TEXT);
  });

  it('clipboard scroll fires after 100ms when isClipboardTranslationRef=true', async () => {
    const el = document.createElement('div');
    el.scrollTop = 99;
    el.scrollLeft = 50;
    const ctx = makeCtx({
      isClipboardTranslationRef: { current: true },
      translationTextRef: { current: el },
    });
    renderHook(() => useAutoTranslateTrigger(makeProps({ ctx })));
    await act(async () => {}); // flush run()

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(el.scrollTop).toBe(0);
    expect(el.scrollLeft).toBe(0);
  });

  it('clipboard scroll does NOT fire when isClipboardTranslationRef=false', async () => {
    const el = document.createElement('div');
    el.scrollTop = 99;
    const ctx = makeCtx({
      isClipboardTranslationRef: { current: false },
      translationTextRef: { current: el },
    });
    renderHook(() => useAutoTranslateTrigger(makeProps({ ctx })));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(el.scrollTop).toBe(99); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Clipboard flag reset
// ---------------------------------------------------------------------------

describe('clipboard flag', () => {
  it('resetClipboardFlag called after translate when clipboard ref is true', async () => {
    const ctx = makeCtx({ isClipboardTranslationRef: { current: true } });
    await renderAndFlush(makeProps({ ctx }));
    expect(ctx.resetClipboardFlag).toHaveBeenCalledOnce();
  });

  it('resetClipboardFlag NOT called when clipboard ref is false', async () => {
    const ctx = makeCtx({ isClipboardTranslationRef: { current: false } });
    await renderAndFlush(makeProps({ ctx }));
    expect(ctx.resetClipboardFlag).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Large text toast
// ---------------------------------------------------------------------------

describe('large text toast', () => {
  it('toast.success fired when text.length > 1000', async () => {
    const translateText = vi.fn().mockResolvedValue(done('long result'));
    await renderAndFlush(makeProps({ inputText: LONG_TEXT, translateText }));
    expect(mockToast.success).toHaveBeenCalledOnce();
  });

  it('toast.success NOT fired when text.length ≤ 1000', async () => {
    await renderAndFlush(makeProps({ inputText: SHORT_TEXT }));
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error recovery
// ---------------------------------------------------------------------------

describe('error recovery', () => {
  it('setIsTranslating(false) still fires when translateText throws (finally)', async () => {
    const ctx = makeCtx();
    const translateText = vi.fn().mockRejectedValue(new Error('network failure'));
    await renderAndFlush(makeProps({ translateText, ctx }));
    expect(ctx.setIsTranslating).toHaveBeenLastCalledWith(false);
  });

  it('toast.error called with extracted message when translateText throws', async () => {
    const translateText = vi.fn().mockRejectedValue(new Error('timeout'));
    await renderAndFlush(makeProps({ translateText }));
    expect(mockToast.error).toHaveBeenCalledOnce();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('timeout'),
      expect.any(Object)
    );
  });
});

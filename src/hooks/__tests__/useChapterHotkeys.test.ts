import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChapterHotkeys } from '../useChapterHotkeys';

function dispatchKey(
  key: string,
  options: { target?: EventTarget; modifiers?: Partial<KeyboardEventInit> } = {}
): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options.modifiers });
  (options.target ?? window).dispatchEvent(event);
}

describe('useChapterHotkeys', () => {
  it('calls onPrevious for "[" and onNext for "]"', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious, onNext }));

    dispatchKey('[');
    dispatchKey(']');

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the Reader tab is not active', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: false, onPrevious, onNext }));

    dispatchKey('[');
    dispatchKey(']');

    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('does nothing while a text input has focus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious, onNext }));

    dispatchKey('[', { target: input });

    expect(onPrevious).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does nothing while the add-entry bar has focus', () => {
    // The bar opens over the reading view with both panels and the chapter strip still
    // live behind it, so `[`/`]` are keys the reader is plausibly typing rather than
    // navigating with — a Vietnamese translation can contain either. `isEditableTarget`
    // is what keeps a chapter jump from firing mid-edit and losing the term being fixed.
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Translation');
    document.body.appendChild(input);
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious, onNext }));

    dispatchKey('[', { target: input });
    dispatchKey(']', { target: input });

    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does nothing while a content-editable element has focus', () => {
    // jsdom does not implement `isContentEditable` from the `contenteditable` attribute —
    // stub it directly, the same workaround used elsewhere in this codebase for DOM APIs
    // jsdom doesn't back.
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    const onPrevious = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious, onNext: vi.fn() }));

    dispatchKey('[', { target: editable });

    expect(onPrevious).not.toHaveBeenCalled();
    document.body.removeChild(editable);
  });

  it('ignores the key with a modifier held', () => {
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious: vi.fn(), onNext }));

    dispatchKey(']', { modifiers: { metaKey: true } });

    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores every other key', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderHook(() => useChapterHotkeys({ isActive: true, onPrevious, onNext }));

    dispatchKey('a');

    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('always calls the latest callbacks without re-attaching the listener', () => {
    const firstOnNext = vi.fn();
    const secondOnNext = vi.fn();
    const { rerender } = renderHook(
      ({ onNext }) => useChapterHotkeys({ isActive: true, onPrevious: vi.fn(), onNext }),
      { initialProps: { onNext: firstOnNext } }
    );

    rerender({ onNext: secondOnNext });
    dispatchKey(']');

    expect(firstOnNext).not.toHaveBeenCalled();
    expect(secondOnNext).toHaveBeenCalledTimes(1);
  });
});

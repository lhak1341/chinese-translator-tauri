import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHotkeyHandler, type HotkeyHandlerOptions } from '../useHotkeyHandler';
import toast from '../../utils/toast';

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function fireKey(init: Partial<KeyboardEventInit> & { key: string }) {
  const event = new KeyboardEvent('keydown', {
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

// flush the microtask queue so the async handleKeyDown body completes
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useHotkeyHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() },
      configurable: true,
    });
  });

  describe('dispatch wiring', () => {
    test('Option+1 dispatches tabSwitch to the Reader — the first tab', async () => {
      const onTabSwitch = vi.fn();
      renderHook(() => useHotkeyHandler({ onTabSwitch }));
      fireKey({ key: '1', code: 'Digit1', altKey: true, metaKey: false });
      await flush();
      expect(onTabSwitch).toHaveBeenCalledWith('reader');
    });

    test('Option+2 dispatches tabSwitch to the Translator, which shifted down one', async () => {
      const onTabSwitch = vi.fn();
      renderHook(() => useHotkeyHandler({ onTabSwitch }));
      fireKey({ key: '2', code: 'Digit2', altKey: true, metaKey: false });
      await flush();
      expect(onTabSwitch).toHaveBeenCalledWith('translator');
    });

    test('Cmd+Z calls onUndo when canUndo is true', async () => {
      const onUndo = vi.fn();
      renderHook(() => useHotkeyHandler({ onUndo, canUndo: true }));
      fireKey({ key: 'z' });
      await flush();
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Z does not call onUndo when canUndo is false', async () => {
      const onUndo = vi.fn();
      renderHook(() => useHotkeyHandler({ onUndo, canUndo: false }));
      fireKey({ key: 'z' });
      await flush();
      expect(onUndo).not.toHaveBeenCalled();
    });

    test('Cmd+Shift+Z calls onRedo when canRedo is true', async () => {
      const onRedo = vi.fn();
      renderHook(() => useHotkeyHandler({ onRedo, canRedo: true }));
      fireKey({ key: 'z', shiftKey: true });
      await flush();
      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+N calls onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHook(() => useHotkeyHandler({ onQuickAdd, activeTab: 'translator' }));
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+V calls onTranslateFromClipboard', async () => {
      const onTranslateFromClipboard = vi.fn();
      renderHook(() => useHotkeyHandler({ onTranslateFromClipboard }));
      fireKey({ key: 'v', shiftKey: true });
      await flush();
      expect(onTranslateFromClipboard).toHaveBeenCalledTimes(1);
    });

    test('Cmd+R calls onReloadDictionary only when activeTab is translator', async () => {
      const onReloadDictionary = vi.fn();
      const { rerender } = renderHook((props: HotkeyHandlerOptions) => useHotkeyHandler(props), {
        initialProps: { onReloadDictionary, activeTab: 'dictionary' },
      });
      fireKey({ key: 'r' });
      await flush();
      expect(onReloadDictionary).not.toHaveBeenCalled();

      rerender({ onReloadDictionary, activeTab: 'translator' });
      fireKey({ key: 'r' });
      await flush();
      expect(onReloadDictionary).toHaveBeenCalledTimes(1);
    });

    test('Cmd+L calls onFocusSearch only when activeTab is dictionary', async () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useHotkeyHandler({ onFocusSearch, activeTab: 'dictionary' }));
      fireKey({ key: 'l' });
      await flush();
      expect(onFocusSearch).toHaveBeenCalledTimes(1);
    });

    test('Cmd+1 on Dictionary tab dispatches dictionaryTabHotkey("1")', async () => {
      const onDictionaryTabHotkey = vi.fn().mockResolvedValue(undefined);
      renderHook(() => useHotkeyHandler({ onDictionaryTabHotkey, activeTab: 'dictionary' }));
      fireKey({ key: '1' });
      await flush();
      expect(onDictionaryTabHotkey).toHaveBeenCalledWith('1');
    });
  });

  describe('clipboard quick-add', () => {
    function setSelection(text: string | null) {
      vi.spyOn(window, 'getSelection').mockReturnValue(
        text === null ? null : ({ toString: () => text } as Selection)
      );
    }

    test('success path: callback receives clipboard text after copy+read', async () => {
      setSelection('selected 文字');
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('selected 文字');
      const onQuickAddCharacter = vi.fn().mockResolvedValue(undefined);

      renderHook(() => useHotkeyHandler({ onQuickAddCharacter, activeTab: 'translator' }));
      fireKey({ key: '1' });
      await flush();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected 文字');
      expect(onQuickAddCharacter).toHaveBeenCalledWith('selected 文字');
    });

    test('no selection: callback receives empty string, clipboard not read', async () => {
      setSelection(null);
      const onQuickAddCharacter = vi.fn().mockResolvedValue(undefined);

      renderHook(() => useHotkeyHandler({ onQuickAddCharacter, activeTab: 'translator' }));
      fireKey({ key: '1' });
      await flush();

      expect(navigator.clipboard.readText).not.toHaveBeenCalled();
      expect(onQuickAddCharacter).toHaveBeenCalledWith('');
    });

    test('error path: callback throwing shows a toast and does not propagate', async () => {
      setSelection('selected 文字');
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('selected 文字');
      const onQuickAddCharacter = vi.fn().mockRejectedValue(new Error('boom'));

      renderHook(() => useHotkeyHandler({ onQuickAddCharacter, activeTab: 'translator' }));
      const event = fireKey({ key: '1' });
      await flush();

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open Add Character')
      );
      expect(event.defaultPrevented).toBe(true);
    });

    test('non-translator tab: quick-add key does not touch clipboard', async () => {
      setSelection('selected 文字');
      const onQuickAddCharacter = vi.fn();

      renderHook(() => useHotkeyHandler({ onQuickAddCharacter, activeTab: 'dictionary' }));
      // On the dictionary tab, Cmd+1 dispatches dictionaryTabHotkey instead — this
      // hook has no onDictionaryTabHotkey wired, so nothing should be called.
      fireKey({ key: '1' });
      await flush();

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(onQuickAddCharacter).not.toHaveBeenCalled();
    });

    test('reader tab: the quick-add family fires there too, unchanged', async () => {
      setSelection('太岳山脉');
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('太岳山脉');
      const onQuickAddProperNoun = vi.fn();

      renderHook(() => useHotkeyHandler({ onQuickAddProperNoun, activeTab: 'reader' }));
      fireKey({ key: '3' });
      await flush();

      expect(onQuickAddProperNoun).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+Shift+N on the reader tab calls onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHook(() => useHotkeyHandler({ onQuickAdd, activeTab: 'reader' }));
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+N on a tab with no add-entry surface does not call onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHook(() => useHotkeyHandler({ onQuickAdd, activeTab: 'rules' }));
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).not.toHaveBeenCalled();
    });

    test('Cmd+7 on reader tab: onOpenNewRule receives clipboard text, Reader reuses the Rules form', async () => {
      setSelection('太岳山脉');
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHook(() => useHotkeyHandler({ onOpenNewRule, activeTab: 'reader' }));
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+7 on translator tab: onOpenNewRule receives clipboard text, same as other quick-add keys', async () => {
      setSelection('太岳山脉');
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHook(() => useHotkeyHandler({ onOpenNewRule, activeTab: 'translator' }));
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+7 on non-translator tab: onOpenNewRule is not called', async () => {
      setSelection('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHook(() => useHotkeyHandler({ onOpenNewRule, activeTab: 'dictionary' }));
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).not.toHaveBeenCalled();
    });
  });

  describe('Reader palette and outline', () => {
    test('Cmd+K on the Reader opens the command palette', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHook(() => useHotkeyHandler({ onOpenCommandPalette, activeTab: 'reader' }));
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
    });

    test('Cmd+K on the Translator does nothing — the palette belongs to the Reader', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHook(() => useHotkeyHandler({ onOpenCommandPalette, activeTab: 'translator' }));
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).not.toHaveBeenCalled();
    });

    test('Cmd+K does nothing while the Reader is a background tab', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHook(() => useHotkeyHandler({ onOpenCommandPalette }));
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).not.toHaveBeenCalled();
    });

    test('Cmd+G on the Reader opens the chapter outline', async () => {
      const onOpenChapterOutline = vi.fn();
      renderHook(() => useHotkeyHandler({ onOpenChapterOutline, activeTab: 'reader' }));
      fireKey({ key: 'g' });
      await flush();
      expect(onOpenChapterOutline).toHaveBeenCalledTimes(1);
    });

    test('Cmd+G on the Dictionary tab does nothing', async () => {
      const onOpenChapterOutline = vi.fn();
      renderHook(() => useHotkeyHandler({ onOpenChapterOutline, activeTab: 'dictionary' }));
      fireKey({ key: 'g' });
      await flush();
      expect(onOpenChapterOutline).not.toHaveBeenCalled();
    });
  });

  describe('chapter stepping', () => {
    test('[ steps to the previous chapter on the Reader', async () => {
      const onPreviousChapter = vi.fn();
      renderHook(() => useHotkeyHandler({ onPreviousChapter, activeTab: 'reader' }));
      fireKey({ key: '[', metaKey: false });
      await flush();
      expect(onPreviousChapter).toHaveBeenCalledTimes(1);
    });

    test('] steps to the next chapter on the Reader', async () => {
      const onNextChapter = vi.fn();
      renderHook(() => useHotkeyHandler({ onNextChapter, activeTab: 'reader' }));
      fireKey({ key: ']', metaKey: false });
      await flush();
      expect(onNextChapter).toHaveBeenCalledTimes(1);
    });

    test('[ does nothing while the Reader is a background tab', async () => {
      const onPreviousChapter = vi.fn();
      renderHook(() => useHotkeyHandler({ onPreviousChapter }));
      fireKey({ key: '[', metaKey: false });
      await flush();
      expect(onPreviousChapter).not.toHaveBeenCalled();
    });

    test('[ typed into an input does nothing', async () => {
      const onPreviousChapter = vi.fn();
      renderHook(() => useHotkeyHandler({ onPreviousChapter, activeTab: 'reader' }));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true })
      );
      await flush();
      expect(onPreviousChapter).not.toHaveBeenCalled();
      input.remove();
    });
  });

  describe('ref-mirror correctness (no stale closures across rerenders)', () => {
    test("a later rerender's callback is the one invoked, not the initial one", async () => {
      const onUndoFirst = vi.fn();
      const onUndoSecond = vi.fn();

      const { rerender } = renderHook((props: HotkeyHandlerOptions) => useHotkeyHandler(props), {
        initialProps: { onUndo: onUndoFirst, canUndo: true },
      });

      rerender({ onUndo: onUndoSecond, canUndo: true });

      fireKey({ key: 'z' });
      await flush();

      expect(onUndoFirst).not.toHaveBeenCalled();
      expect(onUndoSecond).toHaveBeenCalledTimes(1);
    });

    test('canUndo flips to false on rerender without remounting the listener', async () => {
      const onUndo = vi.fn();
      const { rerender } = renderHook((props: HotkeyHandlerOptions) => useHotkeyHandler(props), {
        initialProps: { onUndo, canUndo: true },
      });

      rerender({ onUndo, canUndo: false });

      fireKey({ key: 'z' });
      await flush();

      expect(onUndo).not.toHaveBeenCalled();
    });
  });
});

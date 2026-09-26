import { createElement, type ReactNode } from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHotkeyHandler, type HotkeyHandlerOptions } from '../useHotkeyHandler';
import { VisibleTabProvider, useVisibleTab } from '../../components/VisibleTabContext';
import type { TabId } from '../../types/ComponentTypes';
import toast from '../../utils/toast';
import { registerSelectionMapper } from '../../utils/highlighting/SelectionMapping';

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

function providerAt(visibleTab: TabId) {
  return ({ children }: { children: ReactNode }) =>
    createElement(VisibleTabProvider, { initialTab: visibleTab }, children);
}

/** One registration, with `visibleTab` on screen. */
function renderHotkeys(options: HotkeyHandlerOptions, visibleTab: TabId = 'translator') {
  return renderHook((props: HotkeyHandlerOptions) => useHotkeyHandler(props), {
    initialProps: options,
    wrapper: providerAt(visibleTab),
  });
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
      renderHotkeys({ onTabSwitch, ownTab: 'app' });
      fireKey({ key: '1', code: 'Digit1', altKey: true, metaKey: false });
      await flush();
      expect(onTabSwitch).toHaveBeenCalledWith('reader');
    });

    test('Option+2 dispatches tabSwitch to the Translator, which shifted down one', async () => {
      const onTabSwitch = vi.fn();
      renderHotkeys({ onTabSwitch, ownTab: 'app' });
      fireKey({ key: '2', code: 'Digit2', altKey: true, metaKey: false });
      await flush();
      expect(onTabSwitch).toHaveBeenCalledWith('translator');
    });

    test('Cmd+Z calls onUndo when canUndo is true', async () => {
      const onUndo = vi.fn();
      renderHotkeys({ onUndo, canUndo: true, ownTab: 'dictionary' }, 'dictionary');
      fireKey({ key: 'z' });
      await flush();
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Z does not call onUndo when canUndo is false', async () => {
      const onUndo = vi.fn();
      renderHotkeys({ onUndo, canUndo: false, ownTab: 'dictionary' }, 'dictionary');
      fireKey({ key: 'z' });
      await flush();
      expect(onUndo).not.toHaveBeenCalled();
    });

    test('Cmd+Shift+Z calls onRedo when canRedo is true', async () => {
      const onRedo = vi.fn();
      renderHotkeys({ onRedo, canRedo: true, ownTab: 'dictionary' }, 'dictionary');
      fireKey({ key: 'z', shiftKey: true });
      await flush();
      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+N calls onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHotkeys({ onQuickAdd, ownTab: 'translator' }, 'translator');
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+V calls onTranslateFromClipboard', async () => {
      const onTranslateFromClipboard = vi.fn();
      renderHotkeys({ onTranslateFromClipboard, ownTab: 'translator' }, 'translator');
      fireKey({ key: 'v', shiftKey: true });
      await flush();
      expect(onTranslateFromClipboard).toHaveBeenCalledTimes(1);
    });

    test('Cmd+R reloads once, for the registration whose tab is showing', async () => {
      const translatorReload = vi.fn();
      const readerReload = vi.fn();
      const { result } = renderHook(
        () => {
          useHotkeyHandler({ onReloadDictionary: translatorReload, ownTab: 'translator' });
          useHotkeyHandler({ onReloadDictionary: readerReload, ownTab: 'reader' });
          return useVisibleTab();
        },
        { wrapper: providerAt('reader') }
      );

      fireKey({ key: 'r' });
      await flush();
      expect(readerReload).toHaveBeenCalledTimes(1);
      expect(translatorReload).not.toHaveBeenCalled();

      act(() => result.current.setVisibleTab('translator'));
      fireKey({ key: 'r' });
      await flush();
      expect(translatorReload).toHaveBeenCalledTimes(1);
      expect(readerReload).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Z on the Reader does not undo the dictionary registered alongside it', async () => {
      const onUndo = vi.fn();
      renderHotkeys({ onUndo, canUndo: true, ownTab: 'dictionary' }, 'reader');
      fireKey({ key: 'z' });
      await flush();
      expect(onUndo).not.toHaveBeenCalled();
    });

    test('Cmd+Shift+V on the Reader does not translate in the hidden Translator', async () => {
      const onTranslateFromClipboard = vi.fn();
      renderHotkeys({ onTranslateFromClipboard, ownTab: 'translator' }, 'reader');
      fireKey({ key: 'v', shiftKey: true });
      await flush();
      expect(onTranslateFromClipboard).not.toHaveBeenCalled();
    });

    test('throws outside a VisibleTabProvider rather than going silently inert', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useHotkeyHandler({ ownTab: 'app' }))).toThrow(
        /VisibleTabProvider/
      );
    });

    test('Cmd+L calls onFocusSearch on the Dictionary tab', async () => {
      const onFocusSearch = vi.fn();
      renderHotkeys({ onFocusSearch, ownTab: 'app' }, 'dictionary');
      fireKey({ key: 'l' });
      await flush();
      expect(onFocusSearch).toHaveBeenCalledTimes(1);
    });

    test('Cmd+1 on Dictionary tab dispatches dictionaryTabHotkey("1")', async () => {
      const onDictionaryTabHotkey = vi.fn().mockResolvedValue(undefined);
      renderHotkeys({ onDictionaryTabHotkey, ownTab: 'app' }, 'dictionary');
      fireKey({ key: '1' });
      await flush();
      expect(onDictionaryTabHotkey).toHaveBeenCalledWith('1');
    });
  });

  describe('quick-add source', () => {
    function setSelection(text: string | null) {
      vi.spyOn(window, 'getSelection').mockReturnValue(
        text === null ? null : ({ toString: () => text, rangeCount: 0 } as unknown as Selection)
      );
    }

    /** A selection a registered mapper recognises — a translation-panel selection. */
    function setPanelSelection(vietnamese: string) {
      const text = document.createTextNode(vietnamese);
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, vietnamese.length);
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => vietnamese,
        rangeCount: 1,
        getRangeAt: () => range,
      } as unknown as Selection);
    }

    test('a plain selection passes as-is, and the clipboard is neither written nor read', async () => {
      setSelection('selected 文字');
      const onQuickAddCharacter = vi.fn().mockResolvedValue(undefined);

      renderHotkeys({ onQuickAddCharacter, ownTab: 'translator' }, 'translator');
      fireKey({ key: '1' });
      await flush();

      expect(onQuickAddCharacter).toHaveBeenCalledWith('selected 文字');
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(navigator.clipboard.readText).not.toHaveBeenCalled();
    });

    test('nothing selected: the callback gets what is on the clipboard', async () => {
      setSelection(null);
      vi.mocked(navigator.clipboard.readText).mockResolvedValue(' 萧炎 ');
      const onQuickAddCharacter = vi.fn().mockResolvedValue(undefined);

      renderHotkeys({ onQuickAddCharacter, ownTab: 'translator' }, 'translator');
      fireKey({ key: '1' });
      await flush();

      expect(onQuickAddCharacter).toHaveBeenCalledWith('萧炎');
    });

    test('a mapped translation-panel selection passes its Chinese, not the Vietnamese', async () => {
      setPanelSelection('Lâm Phong');
      const unregister = registerSelectionMapper(() => ({ kind: 'mapped', source: '林风' }));
      const onQuickAddProperNoun = vi.fn().mockResolvedValue(undefined);

      renderHotkeys({ onQuickAddProperNoun, ownTab: 'reader' }, 'reader');
      fireKey({ key: '3' });
      await flush();
      unregister();

      expect(onQuickAddProperNoun).toHaveBeenCalledWith('林风');
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    test('a refused selection toasts its reason and opens nothing', async () => {
      setPanelSelection('Lâm Phong\nđi vào');
      const unregister = registerSelectionMapper(() => ({
        kind: 'refused',
        reason: 'Selection spans more than one line',
      }));
      const onQuickAddProperNoun = vi.fn();

      renderHotkeys({ onQuickAddProperNoun, ownTab: 'reader' }, 'reader');
      fireKey({ key: '3' });
      await flush();
      unregister();

      expect(toast.error).toHaveBeenCalledWith('Selection spans more than one line');
      expect(onQuickAddProperNoun).not.toHaveBeenCalled();
    });

    test('Cmd+7 with nothing selected also takes the clipboard, like the Add keys', async () => {
      setSelection(null);
      vi.mocked(navigator.clipboard.readText).mockResolvedValue('山脉');
      const onOpenNewRule = vi.fn();

      renderHotkeys({ onOpenNewRule, ownTab: 'app' }, 'translator');
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).toHaveBeenCalledWith('山脉');
    });

    test('error path: callback throwing shows a toast and does not propagate', async () => {
      setSelection('selected 文字');
      const onQuickAddCharacter = vi.fn().mockRejectedValue(new Error('boom'));

      renderHotkeys({ onQuickAddCharacter, ownTab: 'translator' }, 'translator');
      const event = fireKey({ key: '1' });
      await flush();

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open Add Character')
      );
      expect(event.defaultPrevented).toBe(true);
    });

    test('Dictionary tab: quick-add key does not touch clipboard', async () => {
      setSelection('selected 文字');
      const onQuickAddCharacter = vi.fn();

      renderHotkeys({ onQuickAddCharacter, ownTab: 'dictionary' }, 'dictionary');
      // On the dictionary tab, Cmd+1 dispatches dictionaryTabHotkey instead — this
      // hook has no onDictionaryTabHotkey wired, so nothing should be called.
      fireKey({ key: '1' });
      await flush();

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(onQuickAddCharacter).not.toHaveBeenCalled();
    });

    test('reader tab: the quick-add family fires there too, unchanged', async () => {
      setSelection('太岳山脉');
      const onQuickAddProperNoun = vi.fn();

      renderHotkeys({ onQuickAddProperNoun, ownTab: 'reader' }, 'reader');
      fireKey({ key: '3' });
      await flush();

      expect(onQuickAddProperNoun).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+Shift+N on the reader tab calls onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHotkeys({ onQuickAdd, ownTab: 'reader' }, 'reader');
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).toHaveBeenCalledTimes(1);
    });

    test('Cmd+Shift+N on a tab with no add-entry surface does not call onQuickAdd', async () => {
      const onQuickAdd = vi.fn();
      renderHotkeys({ onQuickAdd, ownTab: 'app' }, 'rules');
      fireKey({ key: 'n', shiftKey: true });
      await flush();
      expect(onQuickAdd).not.toHaveBeenCalled();
    });

    test('Cmd+7 on reader tab: onOpenNewRule receives the selection, Reader reuses the Rules form', async () => {
      setSelection('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHotkeys({ onOpenNewRule, ownTab: 'app' }, 'reader');
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+7 on translator tab: onOpenNewRule receives the selection, same as other quick-add keys', async () => {
      setSelection('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHotkeys({ onOpenNewRule, ownTab: 'app' }, 'translator');
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).toHaveBeenCalledWith('太岳山脉');
    });

    test('Cmd+7 on the Dictionary tab: onOpenNewRule is not called', async () => {
      setSelection('太岳山脉');
      const onOpenNewRule = vi.fn();

      renderHotkeys({ onOpenNewRule, ownTab: 'app' }, 'dictionary');
      fireKey({ key: '7' });
      await flush();

      expect(onOpenNewRule).not.toHaveBeenCalled();
    });
  });

  describe('Reader palette and outline', () => {
    test('Cmd+K on the Reader opens the command palette', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHotkeys({ onOpenCommandPalette, ownTab: 'reader' }, 'reader');
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
    });

    test('Cmd+K on the Translator does nothing — the palette belongs to the Reader', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHotkeys({ onOpenCommandPalette, ownTab: 'app' }, 'translator');
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).not.toHaveBeenCalled();
    });

    test('Cmd+K does nothing while the Reader is a background tab', async () => {
      const onOpenCommandPalette = vi.fn();
      renderHotkeys({ onOpenCommandPalette, ownTab: 'reader' }, 'translator');
      fireKey({ key: 'k' });
      await flush();
      expect(onOpenCommandPalette).not.toHaveBeenCalled();
    });

    test('Cmd+G on the Reader opens the chapter outline', async () => {
      const onOpenChapterOutline = vi.fn();
      renderHotkeys({ onOpenChapterOutline, ownTab: 'reader' }, 'reader');
      fireKey({ key: 'g' });
      await flush();
      expect(onOpenChapterOutline).toHaveBeenCalledTimes(1);
    });

    test('Cmd+G on the Dictionary tab does nothing', async () => {
      const onOpenChapterOutline = vi.fn();
      renderHotkeys({ onOpenChapterOutline, ownTab: 'app' }, 'dictionary');
      fireKey({ key: 'g' });
      await flush();
      expect(onOpenChapterOutline).not.toHaveBeenCalled();
    });
  });

  describe('chapter stepping', () => {
    test('[ steps to the previous chapter on the Reader', async () => {
      const onPreviousChapter = vi.fn();
      renderHotkeys({ onPreviousChapter, ownTab: 'reader' }, 'reader');
      fireKey({ key: '[', metaKey: false });
      await flush();
      expect(onPreviousChapter).toHaveBeenCalledTimes(1);
    });

    test('] steps to the next chapter on the Reader', async () => {
      const onNextChapter = vi.fn();
      renderHotkeys({ onNextChapter, ownTab: 'reader' }, 'reader');
      fireKey({ key: ']', metaKey: false });
      await flush();
      expect(onNextChapter).toHaveBeenCalledTimes(1);
    });

    test('[ does nothing while the Reader is a background tab', async () => {
      const onPreviousChapter = vi.fn();
      renderHotkeys({ onPreviousChapter, ownTab: 'reader' }, 'translator');
      fireKey({ key: '[', metaKey: false });
      await flush();
      expect(onPreviousChapter).not.toHaveBeenCalled();
    });

    test('[ typed into an input does nothing', async () => {
      const onPreviousChapter = vi.fn();
      renderHotkeys({ onPreviousChapter, ownTab: 'reader' }, 'reader');
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

      const { rerender } = renderHotkeys(
        { onUndo: onUndoFirst, canUndo: true, ownTab: 'dictionary' },
        'dictionary'
      );

      rerender({ onUndo: onUndoSecond, canUndo: true, ownTab: 'dictionary' });

      fireKey({ key: 'z' });
      await flush();

      expect(onUndoFirst).not.toHaveBeenCalled();
      expect(onUndoSecond).toHaveBeenCalledTimes(1);
    });

    test('canUndo flips to false on rerender without remounting the listener', async () => {
      const onUndo = vi.fn();
      const { rerender } = renderHotkeys(
        { onUndo, canUndo: true, ownTab: 'dictionary' },
        'dictionary'
      );

      rerender({ onUndo, canUndo: false, ownTab: 'dictionary' });

      fireKey({ key: 'z' });
      await flush();

      expect(onUndo).not.toHaveBeenCalled();
    });
  });
});

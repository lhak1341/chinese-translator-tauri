import { useEffect, useRef } from 'react';
import type { TabId } from '../types/ComponentTypes';
import { useVisibleTab } from '../components/VisibleTabContext';
import { isEditableTarget } from '../utils/ui/EditableFocus';
import { matchHotkey } from '../utils/ui/HotkeyDispatchTable';
import { currentSelectionRange, mapSelectionRange } from '../utils/highlighting/SelectionMapping';
import type { HotkeyAction, HotkeyOwner } from '../utils/ui/HotkeyDispatchTable';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import toast from '../utils/toast';

export interface HotkeyHandlerOptions {
  onTranslateFromClipboard?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onQuickAdd?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onTabSwitch?: (tab: TabId) => void;
  /**
   * The quick-add callbacks receive the selection as `text` — for a selection in a
   * translation panel, the Chinese it maps to (`utils/highlighting/SelectionMapping.ts`).
   */
  onQuickAddCharacter?: (text?: string) => void;
  onQuickAddPhrase?: (text?: string) => void;
  onQuickAddProperNoun?: (text?: string) => void;
  onQuickAddPattern?: (text?: string) => void;
  onQuickAddCustomProperNoun?: (text?: string) => Promise<void>;
  onQuickAddCustomStructuralPattern?: (text?: string) => Promise<void>;
  onReloadDictionary?: () => void;
  onBindDictionaries?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenChapterOutline?: () => void;
  onPreviousChapter?: () => void;
  onNextChapter?: () => void;
  onPageDown?: () => void;
  onPageUp?: () => void;
  onFocusSearch?: () => void;
  onDictionaryTabHotkey?: (key: string) => Promise<void>;
  onOpenNewRule?: (text?: string) => void;
  /**
   * The tab this registration belongs to, or `'app'` for the tab container's. Not whether
   * it is showing: that comes from `VisibleTabProvider`, so no caller can get it wrong.
   */
  ownTab: HotkeyOwner;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Keyboard Shortcuts:
 * - Option/Alt+1-6: Switch tabs, in `TAB_ORDER` (Reader/Translator/Dictionary/Rules/Configuration/Appearance)
 * - Cmd/Ctrl+1-6: Quick add to different dictionaries (Translator and Reader tabs) / Switch dictionary (Dictionary tab)
 * - Cmd/Ctrl+7: Switch to Rules tab and open the new-rule form, prefilled with the
 *   clipboard/selection text as the Key (Translator and Reader tabs, like the quick-add keys)
 * - Cmd/Ctrl+R: Reload dictionary (Translator and Reader tabs — one shared action)
 * - Cmd/Ctrl+B: Bind dictionaries for the open book (Reader tab only)
 * - Cmd/Ctrl+K: Open the command palette (Reader tab only)
 * - Cmd/Ctrl+G: Open the chapter outline with its search focused (Reader tab only)
 * - `[` / `]`: Previous / next chapter (Reader tab only, no modifier)
 * - Space / Shift+Space: Page the reading panel down / up (Reader tab only, no modifier)
 * - Cmd/Ctrl+L: Focus search (Dictionary tab only)
 * - Cmd/Ctrl+Z: Undo (Dictionary tab only)
 * - Cmd/Ctrl+Shift+Z: Redo (Dictionary tab only)
 * - Cmd/Ctrl+Shift+V: Translate from clipboard (Translator tab only)
 * - Cmd/Ctrl+Shift+N: Quick add entry (Translator and Reader tabs)
 *
 * Every tab rule, and which registration answers a key, lives in
 * HotkeyDispatchTable.matchHotkey — testable as a pure function. This hook only listens,
 * does the clipboard round trip, and calls the callback.
 */
export function useHotkeyHandler(options: HotkeyHandlerOptions): void {
  // Mirror the whole options object into a ref so frequently-updating props don't force
  // the keydown listener to be torn down and re-registered on every change (stale-dep
  // anti-pattern). Read at key-press time, so capturing via ref at render time suffices.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { visibleTab } = useVisibleTab();
  const visibleTabRef = useRef(visibleTab);
  visibleTabRef.current = visibleTab;

  useEffect(() => {
    const copySelectedText = async (): Promise<boolean> => {
      try {
        const selectedText = window.getSelection()?.toString();
        if (selectedText && selectedText.trim()) {
          await navigator.clipboard.writeText(selectedText);
          return true;
        }
      } catch (error) {
        logger.warn('Failed to copy selected text to clipboard:', error);
      }
      return false;
    };

    const handleQuickAdd = async (
      event: KeyboardEvent,
      callback: ((text?: string) => void | Promise<void>) | undefined,
      label: string
    ): Promise<void> => {
      // Several handlers are registered at once (the tab container, the Translator, the
      // Reader) and only one of them wires any given action. Without this, the others
      // still run the clipboard round-trip below to feed a callback that isn't there.
      if (!callback) return;
      event.preventDefault();
      try {
        // A selection in a translation panel is Vietnamese: a registered mapper turns it
        // into the Chinese it came from. Anything else keeps the raw text, as before.
        const mapping = mapSelectionRange(currentSelectionRange());
        if (mapping.kind === 'refused') {
          toast.error(mapping.reason);
          return;
        }
        if (mapping.kind === 'mapped') {
          await callback(mapping.source);
          return;
        }
        const copied = await copySelectedText();
        const text = copied ? await navigator.clipboard.readText() : '';
        await callback?.(text);
      } catch (error) {
        const errorMsg = extractErrorMessage(error);
        toast.error(`Failed to open ${label}: ${errorMsg}`);
        logger.error(`${label} error:`, error);
      }
    };

    const dispatch = async (action: HotkeyAction, event: KeyboardEvent): Promise<void> => {
      const opts = optionsRef.current;
      switch (action.type) {
        case 'tabSwitch':
          opts.onTabSwitch?.(action.tab);
          break;
        case 'quickAdd':
          opts.onQuickAdd?.();
          break;
        case 'translateFromClipboard':
          opts.onTranslateFromClipboard?.();
          break;
        case 'dictionaryTabHotkey':
          await opts.onDictionaryTabHotkey?.(action.key);
          break;
        case 'quickAddCharacter':
          await handleQuickAdd(event, opts.onQuickAddCharacter, 'Add Character');
          break;
        case 'quickAddPhrase':
          await handleQuickAdd(event, opts.onQuickAddPhrase, 'Add Phrase');
          break;
        case 'quickAddProperNoun':
          await handleQuickAdd(event, opts.onQuickAddProperNoun, 'Add Proper Noun');
          break;
        case 'quickAddPattern':
          await handleQuickAdd(event, opts.onQuickAddPattern, 'Add Pattern');
          break;
        case 'quickAddCustomProperNoun':
          await handleQuickAdd(event, opts.onQuickAddCustomProperNoun, 'Add Custom Proper Noun');
          break;
        case 'quickAddCustomStructuralPattern':
          await handleQuickAdd(
            event,
            opts.onQuickAddCustomStructuralPattern,
            'Add Structural Pattern'
          );
          break;
        case 'focusSearch':
          opts.onFocusSearch?.();
          break;
        case 'undo':
          opts.onUndo?.();
          break;
        case 'redo':
          opts.onRedo?.();
          break;
        case 'reloadDictionary':
          opts.onReloadDictionary?.();
          break;
        case 'bindDictionaries':
          opts.onBindDictionaries?.();
          break;
        case 'openCommandPalette':
          opts.onOpenCommandPalette?.();
          break;
        case 'openChapterOutline':
          opts.onOpenChapterOutline?.();
          break;
        case 'previousChapter':
          opts.onPreviousChapter?.();
          break;
        case 'nextChapter':
          opts.onNextChapter?.();
          break;
        case 'pageDown':
          opts.onPageDown?.();
          break;
        case 'pageUp':
          opts.onPageUp?.();
          break;
        case 'openNewRule':
          await handleQuickAdd(event, opts.onOpenNewRule, 'Add Rule');
          break;
      }
    };

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // addEventListener ignores the returned Promise — wrap in try-catch so any
      // synchronous throw from optional-chained callbacks doesn't become an
      // unhandled rejection. handleQuickAdd catches its own async errors.
      try {
        const action = matchHotkey(event, {
          visibleTab: visibleTabRef.current,
          ownTab: optionsRef.current.ownTab,
          canUndo: optionsRef.current.canUndo,
          canRedo: optionsRef.current.canRedo,
          isInputFocused: isEditableTarget(event.target),
        });
        if (!action) return;
        event.preventDefault();
        await dispatch(action, event);
      } catch (error) {
        logger.error('Hotkey handler error:', error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // options read via optionsRef — no deps needed, listener is registered once
}

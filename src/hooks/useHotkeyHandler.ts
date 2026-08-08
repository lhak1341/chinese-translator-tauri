import { useEffect, useRef } from 'react';
import type { TabId } from '../types/ComponentTypes';
import { matchHotkey } from '../utils/ui/HotkeyDispatchTable';
import type { HotkeyAction } from '../utils/ui/HotkeyDispatchTable';
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
  onQuickAddCharacter?: (text?: string) => void;
  onQuickAddPhrase?: (text?: string) => void;
  onQuickAddProperNoun?: (text?: string) => void;
  onQuickAddPattern?: (text?: string) => void;
  onQuickAddCustomProperNoun?: (text?: string) => Promise<void>;
  onQuickAddCustomStructuralPattern?: (text?: string) => Promise<void>;
  onReloadDictionary?: () => void;
  onFocusSearch?: () => void;
  onDictionaryTabHotkey?: (key: string) => Promise<void>;
  activeTab?: TabId;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Keyboard Shortcuts:
 * - Cmd/Ctrl+Shift+1-4: Switch tabs
 * - Cmd/Ctrl+1-5: Quick add to different dictionaries (Translator tab) / Switch dictionary (Dictionary tab)
 * - Cmd/Ctrl+R: Reload dictionary (Translator tab only)
 * - Cmd/Ctrl+L: Focus search (Dictionary tab only)
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+Shift+V: Translate from clipboard
 * - Cmd/Ctrl+Shift+N: Quick add entry
 *
 * Dispatch logic lives in HotkeyDispatchTable.matchHotkey — testable as a pure function.
 */
export function useHotkeyHandler(options: HotkeyHandlerOptions): void {
  // Mirror the whole options object into a ref so frequently-updating props don't force
  // the keydown listener to be torn down and re-registered on every change (stale-dep
  // anti-pattern). Read at key-press time, so capturing via ref at render time suffices.
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
      if (optionsRef.current.activeTab !== 'translator') return;
      event.preventDefault();
      try {
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
      }
    };

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // addEventListener ignores the returned Promise — wrap in try-catch so any
      // synchronous throw from optional-chained callbacks doesn't become an
      // unhandled rejection. handleQuickAdd catches its own async errors.
      try {
        const target = event.target as HTMLElement;
        const isInputFocused =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable;

        const action = matchHotkey(event, {
          activeTab: optionsRef.current.activeTab,
          canUndo: optionsRef.current.canUndo,
          canRedo: optionsRef.current.canRedo,
          isInputFocused,
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

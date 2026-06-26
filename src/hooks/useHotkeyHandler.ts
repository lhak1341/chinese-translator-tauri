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
  onAddEntry?: () => void;
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
export function useHotkeyHandler({
  onTranslateFromClipboard,
  onUndo,
  onRedo,
  onAddEntry,
  onQuickAdd,
  canUndo,
  canRedo,
  onTabSwitch,
  onQuickAddCharacter,
  onQuickAddPhrase,
  onQuickAddProperNoun,
  onQuickAddPattern,
  onQuickAddCustomProperNoun,
  onQuickAddCustomStructuralPattern,
  onReloadDictionary,
  onFocusSearch,
  onDictionaryTabHotkey,
  activeTab,
}: HotkeyHandlerOptions): void {
  // Use refs so frequently-updating props don't force the keydown listener to be
  // torn down and re-registered on every change (stale-dep anti-pattern).
  // Each value is read at key-press time, so capturing via ref at render time is sufficient.
  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const onTranslateFromClipboardRef = useRef(onTranslateFromClipboard);
  onTranslateFromClipboardRef.current = onTranslateFromClipboard;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const onAddEntryRef = useRef(onAddEntry);
  onAddEntryRef.current = onAddEntry;
  const onQuickAddRef = useRef(onQuickAdd);
  onQuickAddRef.current = onQuickAdd;
  const onTabSwitchRef = useRef(onTabSwitch);
  onTabSwitchRef.current = onTabSwitch;
  const onQuickAddCharacterRef = useRef(onQuickAddCharacter);
  onQuickAddCharacterRef.current = onQuickAddCharacter;
  const onQuickAddPhraseRef = useRef(onQuickAddPhrase);
  onQuickAddPhraseRef.current = onQuickAddPhrase;
  const onQuickAddProperNounRef = useRef(onQuickAddProperNoun);
  onQuickAddProperNounRef.current = onQuickAddProperNoun;
  const onQuickAddPatternRef = useRef(onQuickAddPattern);
  onQuickAddPatternRef.current = onQuickAddPattern;
  const onQuickAddCustomProperNounRef = useRef(onQuickAddCustomProperNoun);
  onQuickAddCustomProperNounRef.current = onQuickAddCustomProperNoun;
  const onQuickAddCustomStructuralPatternRef = useRef(onQuickAddCustomStructuralPattern);
  onQuickAddCustomStructuralPatternRef.current = onQuickAddCustomStructuralPattern;
  const onReloadDictionaryRef = useRef(onReloadDictionary);
  onReloadDictionaryRef.current = onReloadDictionary;
  const onFocusSearchRef = useRef(onFocusSearch);
  onFocusSearchRef.current = onFocusSearch;
  const onDictionaryTabHotkeyRef = useRef(onDictionaryTabHotkey);
  onDictionaryTabHotkeyRef.current = onDictionaryTabHotkey;

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
      if (activeTabRef.current !== 'translator') return;
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
      switch (action.type) {
        case 'tabSwitch':
          onTabSwitchRef.current?.(action.tab);
          break;
        case 'quickAdd':
          onQuickAddRef.current?.();
          break;
        case 'translateFromClipboard':
          onTranslateFromClipboardRef.current?.();
          break;
        case 'dictionaryTabHotkey':
          await onDictionaryTabHotkeyRef.current?.(action.key);
          break;
        case 'quickAddCharacter':
          await handleQuickAdd(event, onQuickAddCharacterRef.current, 'Quick Add Character');
          break;
        case 'quickAddPhrase':
          await handleQuickAdd(event, onQuickAddPhraseRef.current, 'Quick Add Phrase');
          break;
        case 'quickAddProperNoun':
          await handleQuickAdd(event, onQuickAddProperNounRef.current, 'Quick Add Proper Noun');
          break;
        case 'quickAddPattern':
          await handleQuickAdd(event, onQuickAddPatternRef.current, 'Quick Add Pattern');
          break;
        case 'quickAddCustomProperNoun':
          await handleQuickAdd(
            event,
            onQuickAddCustomProperNounRef.current,
            'Quick Add Custom Proper Noun'
          );
          break;
        case 'quickAddCustomStructuralPattern':
          await handleQuickAdd(
            event,
            onQuickAddCustomStructuralPatternRef.current,
            'Quick Add Structural Pattern'
          );
          break;
        case 'focusSearch':
          onFocusSearchRef.current?.();
          break;
        case 'undo':
          onUndoRef.current?.();
          break;
        case 'redo':
          onRedoRef.current?.();
          break;
        case 'reloadDictionary':
          onReloadDictionaryRef.current?.();
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
          activeTab: activeTabRef.current,
          canUndo: canUndoRef.current,
          canRedo: canRedoRef.current,
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
  }, []); // All props read via refs — no deps needed, listener is registered once
}

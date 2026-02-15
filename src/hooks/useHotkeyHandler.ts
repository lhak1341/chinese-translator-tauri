import { useEffect, useRef } from 'react';
import type { TabId } from '../types/ComponentTypes';
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
  onReloadDictionary?: () => void;
  onFocusSearch?: () => void;
  activeTab?: TabId;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Keyboard Shortcuts:
 * - Cmd/Ctrl+Shift+1-4: Switch tabs
 * - Cmd/Ctrl+1-5: Quick add to different dictionaries (Translator tab only)
 * - Cmd/Ctrl+R: Reload dictionary (Translator tab only)
 * - Cmd/Ctrl+L: Focus search (Dictionary tab only)
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+Shift+V: Translate from clipboard
 * - Cmd/Ctrl+Shift+N: Quick add entry
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
  onReloadDictionary,
  onFocusSearch,
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
  const onReloadDictionaryRef = useRef(onReloadDictionary);
  onReloadDictionaryRef.current = onReloadDictionary;
  const onFocusSearchRef = useRef(onFocusSearch);
  onFocusSearchRef.current = onFocusSearch;

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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to open ${label}: ${errorMsg}`);
        logger.error(`${label} error:`, error);
      }
    };

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // CODE REVIEW FIX (MEDIUM-1): Wrap the entire body in try-catch.
      // addEventListener ignores the returned Promise, so any unhandled rejection
      // from an async callback becomes an unhandled promise rejection.  The inner
      // handleQuickAdd already catches its own errors, but synchronous throws from
      // optional-chained callbacks (onTabSwitch, onRedo, etc.) would escape without this.
      try {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }

        if (event.metaKey || event.ctrlKey) {
          if (event.shiftKey) {
            switch (event.key) {
              case '1':
                event.preventDefault();
                onTabSwitchRef.current?.('translator');
                break;
              case '2':
                event.preventDefault();
                onTabSwitchRef.current?.('dictionary');
                break;
              case '3':
                event.preventDefault();
                onTabSwitchRef.current?.('configuration');
                break;
              case '4':
                event.preventDefault();
                onTabSwitchRef.current?.('appearance');
                break;
              case 'n':
                event.preventDefault();
                onQuickAddRef.current?.();
                break;
              case 'v':
                event.preventDefault();
                onTranslateFromClipboardRef.current?.();
                break;
            }
          } else {
            switch (event.key) {
              case '1':
                await handleQuickAdd(event, onQuickAddCharacterRef.current, 'Quick Add Character');
                break;
              case '2':
                await handleQuickAdd(event, onQuickAddPhraseRef.current, 'Quick Add Phrase');
                break;
              case '3':
                await handleQuickAdd(
                  event,
                  onQuickAddProperNounRef.current,
                  'Quick Add Proper Noun'
                );
                break;
              case '4':
                await handleQuickAdd(event, onQuickAddPatternRef.current, 'Quick Add Pattern');
                break;
              case '5':
                await handleQuickAdd(
                  event,
                  onQuickAddCustomProperNounRef.current,
                  'Quick Add Custom Proper Noun'
                );
                break;
              case 'l':
                if (activeTabRef.current === 'dictionary') {
                  event.preventDefault();
                  onFocusSearchRef.current?.();
                }
                break;
            }
          }

          switch (event.key.toLowerCase()) {
            case 'z':
              if (event.shiftKey && canRedoRef.current) {
                event.preventDefault();
                onRedoRef.current?.();
              } else if (!event.shiftKey && canUndoRef.current) {
                event.preventDefault();
                onUndoRef.current?.();
              }
              break;
            case 'r':
              if (activeTabRef.current === 'translator') {
                event.preventDefault();
                onReloadDictionaryRef.current?.();
              }
              break;
          }
        }
      } catch (error) {
        logger.error('Hotkey handler error:', error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // All props read via refs — no deps needed, listener is registered once
}

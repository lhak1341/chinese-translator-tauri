import { useEffect } from 'react';
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
      if (activeTab !== 'translator') return;
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
                onTabSwitch?.('translator');
                break;
              case '2':
                event.preventDefault();
                onTabSwitch?.('dictionary');
                break;
              case '3':
                event.preventDefault();
                onTabSwitch?.('configuration');
                break;
              case '4':
                event.preventDefault();
                onTabSwitch?.('appearance');
                break;
              case 'n':
                event.preventDefault();
                onQuickAdd?.();
                break;
              case 'v':
                event.preventDefault();
                onTranslateFromClipboard?.();
                break;
            }
          } else {
            switch (event.key) {
              case '1':
                await handleQuickAdd(event, onQuickAddCharacter, 'Quick Add Character');
                break;
              case '2':
                await handleQuickAdd(event, onQuickAddPhrase, 'Quick Add Phrase');
                break;
              case '3':
                await handleQuickAdd(event, onQuickAddProperNoun, 'Quick Add Proper Noun');
                break;
              case '4':
                await handleQuickAdd(event, onQuickAddPattern, 'Quick Add Pattern');
                break;
              case '5':
                await handleQuickAdd(
                  event,
                  onQuickAddCustomProperNoun,
                  'Quick Add Custom Proper Noun'
                );
                break;
              case 'l':
                if (activeTab === 'dictionary') {
                  event.preventDefault();
                  onFocusSearch?.();
                }
                break;
            }
          }

          switch (event.key.toLowerCase()) {
            case 'z':
              if (event.shiftKey && canRedo) {
                event.preventDefault();
                onRedo?.();
              } else if (canUndo) {
                event.preventDefault();
                onUndo?.();
              }
              break;
            case 'r':
              if (activeTab === 'translator') {
                event.preventDefault();
                onReloadDictionary?.();
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
  }, [
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
  ]);
}

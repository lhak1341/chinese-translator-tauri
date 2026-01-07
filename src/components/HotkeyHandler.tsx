import { useEffect } from 'react';
import type { TabId } from '../types/ComponentTypes';

/**
 * Props for HotkeyHandler component
 */
interface HotkeyHandlerProps {
  onTranslateFromClipboard?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddEntry?: () => void;
  onQuickAdd?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onTabSwitch?: (tab: TabId) => void;
  onQuickAddCharacter?: () => void;
  onQuickAddPhrase?: () => void;
  onQuickAddProperNoun?: () => void;
  onQuickAddPattern?: () => void;
  onQuickAddCustomProperNoun?: () => void;
  onReloadDictionary?: () => void;
  onFocusSearch?: () => void;
  activeTab?: TabId;
}

/**
 * HotkeyHandler Component
 *
 * Manages keyboard shortcuts across the application.
 * Provides global hotkey support for common operations.
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
const HotkeyHandler: React.FC<HotkeyHandlerProps> = ({
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
}) => {
  useEffect(() => {
    // Helper function to copy selected text to clipboard
    const copySelectedText = async (): Promise<boolean> => {
      try {
        const selectedText = window.getSelection()?.toString();
        if (selectedText && selectedText.trim()) {
          await navigator.clipboard.writeText(selectedText);
          return true;
        }
      } catch (error) {
        console.warn('Failed to copy selected text to clipboard:', error);
      }
      return false;
    };

    // This function handles all keyboard events
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // Skip if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Handle keyboard combinations
      if (event.metaKey || event.ctrlKey) {
        // Support both Windows (Ctrl) and Mac (Cmd)
        if (event.shiftKey) {
          // Handle existing shift combinations
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
          // Handle new Cmd/Ctrl (without shift) combinations
          switch (event.key) {
            case '1':
              // Quick Add Character - only works in Translator tab
              if (activeTab === 'translator') {
                event.preventDefault();
                await copySelectedText();
                onQuickAddCharacter?.();
              }
              break;
            case '2':
              // Quick Add Phrase - only works in Translator tab
              if (activeTab === 'translator') {
                event.preventDefault();
                await copySelectedText();
                onQuickAddPhrase?.();
              }
              break;
            case '3':
              // Quick Add Proper Noun - only works in Translator tab
              if (activeTab === 'translator') {
                event.preventDefault();
                await copySelectedText();
                onQuickAddProperNoun?.();
              }
              break;
            case '4':
              // Quick Add Pattern - only works in Translator tab
              if (activeTab === 'translator') {
                event.preventDefault();
                await copySelectedText();
                onQuickAddPattern?.();
              }
              break;
            case '5':
              // Quick Add Custom Proper Noun - only works in Translator tab
              if (activeTab === 'translator') {
                event.preventDefault();
                await copySelectedText();
                onQuickAddCustomProperNoun?.();
              }
              break;
            case 'l':
              // Focus search - only works in Dictionary tab
              if (activeTab === 'dictionary') {
                event.preventDefault();
                onFocusSearch?.();
              }
              break;
          }
        }

        // Handle undo/redo and reload
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
            // Reload Dictionary - only works in Translator tab
            if (activeTab === 'translator') {
              event.preventDefault();
              onReloadDictionary?.();
            }
            break;
        }
      }
    };

    // Add the event listener when component mounts
    window.addEventListener('keydown', handleKeyDown);

    // Remove the event listener when component unmounts
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

  return null; // This component is invisible - it just handles keyboard events
};

export default HotkeyHandler;

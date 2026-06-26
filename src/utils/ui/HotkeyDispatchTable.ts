import type { TabId } from '../../types/ComponentTypes';

export type HotkeyAction =
  | { type: 'tabSwitch'; tab: TabId }
  | { type: 'quickAdd' }
  | { type: 'translateFromClipboard' }
  | { type: 'quickAddCharacter' }
  | { type: 'quickAddPhrase' }
  | { type: 'quickAddProperNoun' }
  | { type: 'quickAddPattern' }
  | { type: 'quickAddCustomProperNoun' }
  | { type: 'quickAddCustomStructuralPattern' }
  | { type: 'dictionaryTabHotkey'; key: string }
  | { type: 'focusSearch' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reloadDictionary' };

export interface MatchHotkeyContext {
  activeTab?: TabId;
  canUndo?: boolean;
  canRedo?: boolean;
  isInputFocused: boolean;
}

/**
 * Pure dispatch table: maps (key + modifiers + app context) → action or null.
 * No side effects, no React, no DOM. The hook uses this to decide what to do;
 * it owns the actual execution (refs, clipboard, toast).
 *
 * key.toLowerCase() is used throughout so Cmd+Shift+Z (key='Z') and Cmd+Z
 * (key='z') both land in the same switch branch, discriminated by shiftKey.
 */
export function matchHotkey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  context: MatchHotkeyContext
): HotkeyAction | null {
  if (context.isInputFocused) return null;
  if (!event.metaKey && !event.ctrlKey) return null;

  const key = event.key.toLowerCase();
  const shift = event.shiftKey;
  const { activeTab, canUndo, canRedo } = context;

  if (shift) {
    switch (key) {
      case '1':
        return { type: 'tabSwitch', tab: 'translator' };
      case '2':
        return { type: 'tabSwitch', tab: 'dictionary' };
      case '3':
        return { type: 'tabSwitch', tab: 'configuration' };
      case '4':
        return { type: 'tabSwitch', tab: 'appearance' };
      case 'n':
        return { type: 'quickAdd' };
      case 'v':
        return { type: 'translateFromClipboard' };
      case 'z':
        return canRedo ? { type: 'redo' } : null;
    }
  } else {
    switch (key) {
      case '1':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '1' }
          : { type: 'quickAddCharacter' };
      case '2':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '2' }
          : { type: 'quickAddPhrase' };
      case '3':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '3' }
          : { type: 'quickAddProperNoun' };
      case '4':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '4' }
          : { type: 'quickAddPattern' };
      case '5':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '5' }
          : { type: 'quickAddCustomProperNoun' };
      case '6':
        return activeTab === 'dictionary'
          ? { type: 'dictionaryTabHotkey', key: '6' }
          : { type: 'quickAddCustomStructuralPattern' };
      case 'l':
        return activeTab === 'dictionary' ? { type: 'focusSearch' } : null;
      case 'z':
        return canUndo ? { type: 'undo' } : null;
      case 'r':
        return activeTab === 'translator' ? { type: 'reloadDictionary' } : null;
    }
  }

  return null;
}

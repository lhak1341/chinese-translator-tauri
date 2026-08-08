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
  | { type: 'reloadDictionary' }
  | { type: 'openNewRule' };

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
 *
 * Tab switching is the one exception: it matches on `event.code` (Digit1-5), not
 * `event.key`. Option/Alt remaps digit keys to different characters per keyboard
 * layout — on a US Mac layout, Option+1 reports `key: '¡'`, not `'1'` — so matching on
 * `.key` would silently break for most users. `.code` is the physical key position and
 * is unaffected by modifier-driven character remapping.
 */
export function matchHotkey(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  context: MatchHotkeyContext
): HotkeyAction | null {
  if (context.isInputFocused) return null;

  // Option/Alt+1-5: tab switching. Checked first since it uses a modifier the rest of
  // this table doesn't — was Cmd/Ctrl+Shift+1-5 until that collided with a default
  // macOS shortcut; Option+digit doesn't.
  if (event.altKey && !event.metaKey && !event.ctrlKey) {
    switch (event.code) {
      case 'Digit1':
        return { type: 'tabSwitch', tab: 'translator' };
      case 'Digit2':
        return { type: 'tabSwitch', tab: 'dictionary' };
      case 'Digit3':
        return { type: 'tabSwitch', tab: 'rules' };
      case 'Digit4':
        return { type: 'tabSwitch', tab: 'configuration' };
      case 'Digit5':
        return { type: 'tabSwitch', tab: 'appearance' };
    }
    return null;
  }

  if (!event.metaKey && !event.ctrlKey) return null;

  const key = event.key.toLowerCase();
  const shift = event.shiftKey;
  const { activeTab, canUndo, canRedo } = context;

  if (shift) {
    switch (key) {
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
      case '7':
        return { type: 'openNewRule' };
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

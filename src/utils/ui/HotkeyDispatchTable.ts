import type { TabId } from '../../types/ComponentTypes';
import { tabForShortcutDigit } from '../../constants/tabs';

export type HotkeyAction =
  | { type: 'tabSwitch'; tab: TabId }
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
  | { type: 'bindDictionaries' }
  | { type: 'openCommandPalette' }
  | { type: 'openChapterOutline' }
  | { type: 'previousChapter' }
  | { type: 'nextChapter' }
  | { type: 'openNewRule' }
  | { type: 'pageDown' }
  | { type: 'pageUp' };

/**
 * The actions that start from a source text — the selection's Chinese, else the clipboard
 * (`resolveQuickAddSource`) — with the name a failure toast gives each. One fact, read by the
 * hotkey hook (which resolves the source for these and no others) and by the Reader's palette
 * (which passes its source to these and no others), so a key and its palette row always start
 * from the same text. See CONTEXT.md "Reader Commands".
 */
export const SOURCE_ACTION_LABELS = {
  quickAddCharacter: 'Add Character',
  quickAddPhrase: 'Add Phrase',
  quickAddProperNoun: 'Add Proper Noun',
  quickAddPattern: 'Add Pattern',
  quickAddCustomProperNoun: 'Add Custom Proper Noun',
  quickAddCustomStructuralPattern: 'Add Structural Pattern',
  openNewRule: 'Add Rule',
} as const satisfies Partial<Record<HotkeyAction['type'], string>>;

export type SourceActionType = keyof typeof SOURCE_ACTION_LABELS;

export function takesSource(type: HotkeyAction['type']): type is SourceActionType {
  return Object.prototype.hasOwnProperty.call(SOURCE_ACTION_LABELS, type);
}

/** What each action's handler receives: its payload, the source text, or nothing. */
type HandlerArgs<A extends HotkeyAction> = A extends { type: 'tabSwitch'; tab: infer T }
  ? [tab: T]
  : A extends { type: 'dictionaryTabHotkey'; key: infer K }
    ? [key: K]
    : A['type'] extends SourceActionType
      ? [text?: string]
      : [];

/** A registration's handlers, keyed by the table's own action types. An action with no
 * handler is not this registration's to answer. */
export type HotkeyHandlers = {
  [A in HotkeyAction as A['type']]?: (...args: HandlerArgs<A>) => void | Promise<void>;
};

/**
 * The tab a hotkey registration belongs to. `'app'` is the tab container's own
 * registration (tab switching, Cmd+B, the Dictionary tab's Cmd-1..6 and Cmd+L, Cmd-7),
 * which answers whichever tab is showing.
 */
export type HotkeyOwner = TabId | 'app';

/** Tabs where Cmd-1..6 and Cmd+Shift+N add a dictionary entry: both open the same modal. */
const QUICK_ADD_TABS: readonly TabId[] = ['translator', 'reader'];

/** Tabs where Cmd-7 opens the Rules tab's new-rule form. */
const NEW_RULE_TABS: readonly TabId[] = ['translator', 'reader'];

/** The Add dialog's actions: Cmd-1..6, and Cmd+Shift+N, bound to `quickAddProperNoun`. */
export type QuickAddAction = Extract<
  HotkeyAction['type'],
  | 'quickAddCharacter'
  | 'quickAddPhrase'
  | 'quickAddProperNoun'
  | 'quickAddPattern'
  | 'quickAddCustomProperNoun'
  | 'quickAddCustomStructuralPattern'
>;

/** Cmd-1..6 outside the Dictionary tab. */
const DIGIT_ACTIONS: Readonly<Record<string, QuickAddAction>> = {
  '1': 'quickAddCharacter',
  '2': 'quickAddPhrase',
  '3': 'quickAddProperNoun',
  '4': 'quickAddPattern',
  '5': 'quickAddCustomProperNoun',
  '6': 'quickAddCustomStructuralPattern',
};

export interface MatchHotkeyContext {
  /** The tab on screen. Every tab stays mounted, so this is not "the caller's tab". */
  visibleTab: TabId;
  /** The registration asking. */
  ownTab: HotkeyOwner;
  canUndo?: boolean;
  canRedo?: boolean;
  isInputFocused: boolean;
}

/**
 * Pure dispatch table: maps (key + modifiers + app context) → action or null.
 * No side effects, no React, no DOM. The hook uses this to decide what to do;
 * it owns the actual execution (refs, clipboard, toast).
 *
 * Every tab rule lives here, in two steps. Ownership first: several registrations hear
 * every key (all tabs stay mounted), so a registration answers only while its own tab is
 * showing, or always if it is the app-level one. Otherwise Cmd+R on the Reader would
 * reload for the Reader and the Translator both. Then each action's own tab rule, read
 * against `visibleTab` alone.
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
  const { visibleTab, ownTab, canUndo, canRedo } = context;
  if (ownTab !== 'app' && ownTab !== visibleTab) return null;

  // Space pages the reading panel, with or without Shift for direction — dispatched here
  // rather than left to the browser's own "scroll the focused element" behavior, which is
  // what silently broke: a virtualized row can leave the DOM (recycled out of view) while
  // it holds focus, and the browser has nothing left to scroll until the panel is clicked
  // again. Routing it through the same window-level handler as every other reader
  // shortcut needs no DOM focus at all, so it can't be lost that way.
  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    if (visibleTab === 'reader' && event.key === ' ') {
      return { type: event.shiftKey ? 'pageUp' : 'pageDown' };
    }
  }

  // `[` / `]` step chapters, with no modifier at all — the one unmodified pair in this
  // table. They shadow printable characters, which is exactly what the `isInputFocused`
  // guard above exists for: typing a literal bracket into a search box or a dictionary
  // entry must never step a chapter.
  if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    if (visibleTab !== 'reader') return null;
    if (event.key === '[') return { type: 'previousChapter' };
    if (event.key === ']') return { type: 'nextChapter' };
    return null;
  }

  // Option/Alt+digit: tab switching. Checked first since it uses a modifier the rest of
  // this table doesn't — was Cmd/Ctrl+Shift+1-5 until that collided with a default
  // macOS shortcut; Option+digit doesn't.
  //
  // The digit is an index into TAB_ORDER rather than a switch over tab names, so the nav
  // bar and these shortcuts cannot drift apart: both read the same array.
  if (event.altKey && !event.metaKey && !event.ctrlKey) {
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (!digit) return null;
    const tab = tabForShortcutDigit(Number(digit[1]));
    return tab ? { type: 'tabSwitch', tab } : null;
  }

  if (!event.metaKey && !event.ctrlKey) return null;

  const key = event.key.toLowerCase();
  const shift = event.shiftKey;
  const onQuickAddTab = QUICK_ADD_TABS.includes(visibleTab);

  if (shift) {
    switch (key) {
      case 'n':
        // The unqualified Add: a name, the commonest Add on both tabs.
        return onQuickAddTab ? { type: 'quickAddProperNoun' } : null;
      // Translator-only: the text lands in the Translator's input, and a translation it
      // starts while hidden would run beside the Reader's engine queue, which only the
      // tab gate keeps apart from the Translator's calls.
      case 'v':
        return visibleTab === 'translator' ? { type: 'translateFromClipboard' } : null;
      // Undo and redo act on the dictionary edit history, whose errors and state only
      // the Dictionary tab shows. Elsewhere they would undo an edit out of sight.
      case 'z':
        return visibleTab === 'dictionary' && canRedo ? { type: 'redo' } : null;
    }
    return null;
  }

  // Cmd-1..6: pick a dictionary on the Dictionary tab, add an entry on the Translator
  // and Reader, nothing elsewhere (the modal would open behind a hidden panel).
  const digitAction = DIGIT_ACTIONS[key];
  if (digitAction) {
    if (visibleTab === 'dictionary') return { type: 'dictionaryTabHotkey', key };
    return onQuickAddTab ? { type: digitAction } : null;
  }

  switch (key) {
    case '7':
      return NEW_RULE_TABS.includes(visibleTab) ? { type: 'openNewRule' } : null;
    case 'l':
      return visibleTab === 'dictionary' ? { type: 'focusSearch' } : null;
    case 'z':
      return visibleTab === 'dictionary' && canUndo ? { type: 'undo' } : null;
    // The Reader shares the Translator's reload, not a variant of it: the action is
    // "throw the engine away and rebuild it from disk", and the Reader's whole
    // revise-and-see-it loop is that action plus re-anchoring afterwards.
    case 'r':
      return visibleTab === 'translator' || visibleTab === 'reader'
        ? { type: 'reloadDictionary' }
        : null;
    case 'b':
      return visibleTab === 'reader' ? { type: 'bindDictionaries' } : null;
    // The palette and the outline are Reader-only for the same reason as Cmd+B: both
    // act on the open book, and there is nothing for them to act on anywhere else.
    case 'k':
      return visibleTab === 'reader' ? { type: 'openCommandPalette' } : null;
    case 'g':
      return visibleTab === 'reader' ? { type: 'openChapterOutline' } : null;
  }

  return null;
}

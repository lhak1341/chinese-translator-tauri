import type { HotkeyAction } from '../ui/HotkeyDispatchTable';

/**
 * Everything the reader can ask the Reader to do, named by the dispatch table's own action
 * types — so a palette row, a hotkey and a button that mean the same action share one
 * name, and one function (see `useReaderCommands`). See CONTEXT.md's "Reader Commands".
 *
 * `Extract` rather than a free union: an id that is not a real `HotkeyAction` type is a
 * compile error, so this list cannot invent a vocabulary of its own.
 */
export type ReaderActionId = Extract<
  HotkeyAction['type'],
  | 'openChapterOutline'
  | 'previousChapter'
  | 'nextChapter'
  | 'bindDictionaries'
  | 'reloadDictionary'
  | 'quickAddCharacter'
  | 'quickAddPhrase'
  | 'quickAddProperNoun'
  | 'quickAddPattern'
  | 'quickAddCustomProperNoun'
  | 'quickAddCustomStructuralPattern'
  | 'openCommandPalette'
  | 'pageDown'
  | 'pageUp'
>;

/**
 * One action. The Add family takes the text to pre-fill; every other action ignores it.
 * Both routes ask `resolveQuickAddSource` where that text comes from — the palette when it
 * opens, a hotkey when pressed — so a row and its key start from the same text.
 */
export type ReaderAction = (text?: string) => void | Promise<void>;

export type ReaderActions = Record<ReaderActionId, ReaderAction>;

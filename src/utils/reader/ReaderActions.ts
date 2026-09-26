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
  | 'quickAdd'
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
 * Where that text comes from is the route's business: the palette passes the selection it
 * captured on opening, a hotkey its own clipboard round trip — or, for a selection in the
 * Translation panel, the Chinese it maps to plus the selected Vietnamese as `translation`.
 */
export type ReaderAction = (text?: string, translation?: string) => void | Promise<void>;

export type ReaderActions = Record<ReaderActionId, ReaderAction>;

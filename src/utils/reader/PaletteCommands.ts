import type { ReaderActionId, ReaderActions } from './ReaderActions';
/**
 * The command palette's rows, as data.
 *
 * Every row that has a direct shortcut carries it as a `hint`, because the palette is
 * also where those shortcuts are discovered — the chapter-stepping keys have no other
 * surface that names them. The hints are written the way `docs/HOTKEYS.md` writes them
 * ("Cmd/Ctrl+B"), not resolved per platform: this app runs on both, and one spelling
 * that reads correctly everywhere beats a platform sniff that can be wrong.
 */

/** Which part of the list a row belongs to. Also matched against, so typing a group name
 * browses that group. */
export type PaletteGroup = 'Navigate' | 'Dictionaries' | 'Add entry' | 'Books';

export interface PaletteCommand {
  id: string;
  label: string;
  /** The direct shortcut for this action, if it has one. Rows without a binding — the
   * per-book switch rows — leave it unset rather than showing an empty hint. */
  hint?: string;
  group: PaletteGroup;
  /** Extra words this row matches on: what a reader might type when the label is not the
   * word they have in mind ("toc" for the chapter outline). */
  keywords?: readonly string[];
  /** The action this row runs — the same one its hotkey runs. Unset on the per-book switch
   * rows, which are the palette's own. */
  action?: ReaderActionId;
  run: () => void;
}

/** A book as the palette needs it: enough to label a row and open the file. */
export interface PaletteBook {
  fileName: string;
  title: string;
}

export interface BuildPaletteCommandsInput {
  /** Every book on the shelf, including the open one. */
  books: readonly PaletteBook[];
  /** The open book's file name — its own row would be a no-op, so it is left out. */
  currentFileName: string;
  /** The Reader's actions — see `useReaderCommands`. */
  actions: ReaderActions;
  /** The reader's selection as of the moment the palette opened, handed to whichever Add
   * row runs. Captured then, because focusing the palette's search collapses it. */
  selection: string;
  onSwitchBook: (fileName: string) => void;
}

/** The palette's action rows, in display order. */
const ACTION_ROWS: ReadonlyArray<Omit<PaletteCommand, 'run'> & { action: ReaderActionId }> = [
  {
    id: 'jump-to-chapter',
    label: 'Jump to chapter',
    hint: 'Cmd/Ctrl+G',
    group: 'Navigate',
    keywords: ['outline', 'toc', 'contents', 'table'],
    action: 'openChapterOutline',
  },
  {
    id: 'previous-chapter',
    label: 'Previous chapter',
    hint: '[',
    group: 'Navigate',
    keywords: ['back'],
    action: 'previousChapter',
  },
  {
    id: 'next-chapter',
    label: 'Next chapter',
    hint: ']',
    group: 'Navigate',
    keywords: ['forward'],
    action: 'nextChapter',
  },
  {
    id: 'bind-dictionaries',
    label: 'Bind dictionaries for this book',
    hint: 'Cmd/Ctrl+B',
    group: 'Dictionaries',
    keywords: ['fiction', 'binding'],
    action: 'bindDictionaries',
  },
  {
    id: 'reload-dictionaries',
    label: 'Reload dictionaries',
    hint: 'Cmd/Ctrl+R',
    group: 'Dictionaries',
    keywords: ['refresh', 'engine'],
    action: 'reloadDictionary',
  },
  {
    id: 'add-character',
    label: 'Add to Characters',
    hint: 'Cmd/Ctrl+1',
    group: 'Add entry',
    keywords: ['selection', 'entry'],
    action: 'quickAddCharacter',
  },
  {
    id: 'add-phrase',
    label: 'Add to Phrases',
    hint: 'Cmd/Ctrl+2',
    group: 'Add entry',
    keywords: ['selection', 'entry'],
    action: 'quickAddPhrase',
  },
  {
    id: 'add-proper-noun',
    label: 'Add to Proper Nouns',
    hint: 'Cmd/Ctrl+3',
    group: 'Add entry',
    keywords: ['selection', 'entry', 'name'],
    action: 'quickAddProperNoun',
  },
  {
    id: 'add-pattern',
    label: 'Add to Patterns',
    hint: 'Cmd/Ctrl+4',
    group: 'Add entry',
    keywords: ['selection', 'entry'],
    action: 'quickAddPattern',
  },
  {
    id: 'add-fiction-proper-noun',
    label: "Add to this fiction's Proper Nouns",
    hint: 'Cmd/Ctrl+5',
    group: 'Add entry',
    keywords: ['selection', 'entry', 'name', 'bound'],
    action: 'quickAddCustomProperNoun',
  },
  {
    id: 'add-fiction-structural-pattern',
    label: "Add to this fiction's Structural Patterns",
    hint: 'Cmd/Ctrl+6',
    group: 'Add entry',
    keywords: ['selection', 'entry', 'bound'],
    action: 'quickAddCustomStructuralPattern',
  },
];

export function buildPaletteCommands({
  books,
  currentFileName,
  actions,
  selection,
  onSwitchBook,
}: BuildPaletteCommandsInput): PaletteCommand[] {
  const commands: PaletteCommand[] = ACTION_ROWS.map((row) => ({
    ...row,
    run: () => void actions[row.action](selection),
  }));

  for (const book of books) {
    if (book.fileName === currentFileName) continue;
    commands.push({
      id: `switch-book:${book.fileName}`,
      label: `Switch to ${book.title}`,
      group: 'Books',
      run: () => onSwitchBook(book.fileName),
    });
  }

  return commands;
}

/** Everything a row matches on, lowercased once per filter pass. */
function haystack(command: PaletteCommand): string {
  return [command.label, command.group, ...(command.keywords ?? [])].join(' ').toLowerCase();
}

/**
 * Filter by substring, token by token: every whitespace-separated token in the query must
 * appear somewhere in the row's text, in any order. "chapter jump" and "jump chapter"
 * both find the outline; a token that matches nothing empties the list.
 */
export function filterPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string
): PaletteCommand[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...commands];
  return commands.filter((command) => {
    const text = haystack(command);
    return tokens.every((token) => text.includes(token));
  });
}

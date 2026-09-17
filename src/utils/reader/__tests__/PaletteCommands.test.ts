import { describe, it, expect, vi } from 'vitest';
import { matchHotkey } from '../../ui/HotkeyDispatchTable';
import type { HotkeyAction } from '../../ui/HotkeyDispatchTable';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  type PaletteCommandHandlers,
} from '../PaletteCommands';

function handlers(overrides: Partial<PaletteCommandHandlers> = {}): PaletteCommandHandlers {
  return {
    onJumpToChapter: vi.fn(),
    onPreviousChapter: vi.fn(),
    onNextChapter: vi.fn(),
    onBindDictionaries: vi.fn(),
    onReloadDictionaries: vi.fn(),
    onAddCharacter: vi.fn(),
    onAddPhrase: vi.fn(),
    onAddProperNoun: vi.fn(),
    onAddPattern: vi.fn(),
    onAddFictionProperNoun: vi.fn(),
    onAddFictionStructuralPattern: vi.fn(),
    onSwitchBook: vi.fn(),
    ...overrides,
  };
}

const books = [
  { fileName: 'open.txt', title: 'The Open Book' },
  { fileName: 'other.txt', title: 'Another Novel' },
  { fileName: 'third.txt', title: 'Third Story' },
];

describe('buildPaletteCommands', () => {
  it('offers every action the ticket names', () => {
    const commands = buildPaletteCommands({
      books,
      currentFileName: 'open.txt',
      handlers: handlers(),
    });
    const ids = commands.map((command) => command.id);
    expect(ids).toContain('jump-to-chapter');
    expect(ids).toContain('bind-dictionaries');
    expect(ids).toContain('reload-dictionaries');
    expect(ids).toContain('add-proper-noun');
    expect(ids).toContain('switch-book:other.txt');
  });

  it('shows each row its direct shortcut, and none for rows that have no binding', () => {
    const commands = buildPaletteCommands({
      books,
      currentFileName: 'open.txt',
      handlers: handlers(),
    });
    const hintFor = (id: string) => commands.find((command) => command.id === id)?.hint;
    expect(hintFor('jump-to-chapter')).toBe('Cmd/Ctrl+G');
    expect(hintFor('previous-chapter')).toBe('[');
    expect(hintFor('next-chapter')).toBe(']');
    expect(hintFor('bind-dictionaries')).toBe('Cmd/Ctrl+B');
    expect(hintFor('reload-dictionaries')).toBe('Cmd/Ctrl+R');
    expect(hintFor('add-character')).toBe('Cmd/Ctrl+1');
    expect(hintFor('switch-book:other.txt')).toBeUndefined();
  });

  it('leaves the open book out of the switch-book rows', () => {
    const commands = buildPaletteCommands({
      books,
      currentFileName: 'open.txt',
      handlers: handlers(),
    });
    const bookIds = commands.filter((c) => c.group === 'Books').map((c) => c.id);
    expect(bookIds).toEqual(['switch-book:other.txt', 'switch-book:third.txt']);
  });

  it('runs the handler the row stands for', () => {
    const onReloadDictionaries = vi.fn();
    const onSwitchBook = vi.fn();
    const commands = buildPaletteCommands({
      books,
      currentFileName: 'open.txt',
      handlers: handlers({ onReloadDictionaries, onSwitchBook }),
    });
    commands.find((command) => command.id === 'reload-dictionaries')?.run();
    commands.find((command) => command.id === 'switch-book:third.txt')?.run();
    expect(onReloadDictionaries).toHaveBeenCalledTimes(1);
    expect(onSwitchBook).toHaveBeenCalledWith('third.txt');
  });

  it('builds without books — a shelf of one still offers every other action', () => {
    const commands = buildPaletteCommands({
      books: [],
      currentFileName: 'open.txt',
      handlers: handlers(),
    });
    expect(commands.some((command) => command.group === 'Books')).toBe(false);
    expect(commands.length).toBeGreaterThan(0);
  });
});

describe('filterPaletteCommands', () => {
  const commands = buildPaletteCommands({
    books,
    currentFileName: 'open.txt',
    handlers: handlers(),
  });

  it('returns everything for an empty or whitespace query', () => {
    expect(filterPaletteCommands(commands, '')).toHaveLength(commands.length);
    expect(filterPaletteCommands(commands, '   ')).toHaveLength(commands.length);
  });

  it('matches on the label, case-insensitively', () => {
    const matched = filterPaletteCommands(commands, 'RELOAD');
    expect(matched.map((command) => command.id)).toEqual(['reload-dictionaries']);
  });

  it('matches a book by its title', () => {
    expect(filterPaletteCommands(commands, 'another').map((command) => command.id)).toEqual([
      'switch-book:other.txt',
    ]);
  });

  it('requires every whitespace-separated token to match, in any order', () => {
    expect(filterPaletteCommands(commands, 'chapter jump').map((c) => c.id)).toEqual([
      'jump-to-chapter',
    ]);
    expect(filterPaletteCommands(commands, 'chapter nothing')).toEqual([]);
  });

  it('matches on keywords the label does not contain', () => {
    expect(filterPaletteCommands(commands, 'outline').map((command) => command.id)).toEqual([
      'jump-to-chapter',
    ]);
  });

  it('matches on the group name, so a group is browsable by typing it', () => {
    const matched = filterPaletteCommands(commands, 'books');
    expect(matched.length).toBe(2);
    expect(matched.every((command) => command.group === 'Books')).toBe(true);
  });
});

/**
 * The palette's hints are what the shortcuts are discovered through, so they are pinned
 * to the dispatch table rather than to themselves: every hint is parsed back into the
 * keypress it describes and pushed through `matchHotkey`. Change a binding in
 * `HotkeyDispatchTable.ts` and the palette's advertised key fails here instead of
 * silently advertising a dead one.
 */
describe('hints match what the dispatch table actually does', () => {
  const expectedAction: Record<string, HotkeyAction> = {
    'jump-to-chapter': { type: 'openChapterOutline' },
    'previous-chapter': { type: 'previousChapter' },
    'next-chapter': { type: 'nextChapter' },
    'bind-dictionaries': { type: 'bindDictionaries' },
    'reload-dictionaries': { type: 'reloadDictionary' },
    'add-character': { type: 'quickAddCharacter' },
    'add-phrase': { type: 'quickAddPhrase' },
    'add-proper-noun': { type: 'quickAddProperNoun' },
    'add-pattern': { type: 'quickAddPattern' },
    'add-fiction-proper-noun': { type: 'quickAddCustomProperNoun' },
    'add-fiction-structural-pattern': { type: 'quickAddCustomStructuralPattern' },
  };

  /** "Cmd/Ctrl+B" → the Cmd+B keypress; a bare hint like "[" → that key, unmodified. */
  function pressFor(hint: string) {
    const isModified = hint.startsWith('Cmd/Ctrl+');
    return {
      key: (isModified ? hint.slice('Cmd/Ctrl+'.length) : hint).toLowerCase(),
      code: '',
      metaKey: isModified,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
  }

  const commands = buildPaletteCommands({
    books,
    currentFileName: 'open.txt',
    handlers: handlers(),
  });

  it.each(Object.keys(expectedAction))('%s advertises the key that fires it', (id) => {
    const hint = commands.find((command) => command.id === id)?.hint;
    expect(hint).toBeDefined();
    expect(
      matchHotkey(pressFor(hint as string), { activeTab: 'reader', isInputFocused: false })
    ).toEqual(expectedAction[id]);
  });

  it('covers every row that claims a hint', () => {
    const hinted = commands.filter((command) => command.hint).map((command) => command.id);
    expect(hinted.sort()).toEqual(Object.keys(expectedAction).sort());
  });
});

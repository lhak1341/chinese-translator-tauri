import { describe, it, expect, vi } from 'vitest';
import { matchHotkey } from '../../ui/HotkeyDispatchTable';
import { buildPaletteCommands, filterPaletteCommands } from '../PaletteCommands';
import type { ReaderActions } from '../ReaderActions';

function actions(overrides: Partial<ReaderActions> = {}): ReaderActions {
  return {
    openChapterOutline: vi.fn(),
    previousChapter: vi.fn(),
    nextChapter: vi.fn(),
    bindDictionaries: vi.fn(),
    reloadDictionary: vi.fn(),
    quickAdd: vi.fn(),
    quickAddCharacter: vi.fn(),
    quickAddPhrase: vi.fn(),
    quickAddProperNoun: vi.fn(),
    quickAddPattern: vi.fn(),
    quickAddCustomProperNoun: vi.fn(),
    quickAddCustomStructuralPattern: vi.fn(),
    openCommandPalette: vi.fn(),
    pageDown: vi.fn(),
    pageUp: vi.fn(),
    ...overrides,
  };
}

function build(overrides: Partial<Parameters<typeof buildPaletteCommands>[0]> = {}) {
  return buildPaletteCommands({
    books,
    currentFileName: 'open.txt',
    actions: actions(),
    selection: '',
    onSwitchBook: vi.fn(),
    ...overrides,
  });
}

const books = [
  { fileName: 'open.txt', title: 'The Open Book' },
  { fileName: 'other.txt', title: 'Another Novel' },
  { fileName: 'third.txt', title: 'Third Story' },
];

describe('buildPaletteCommands', () => {
  it('offers every action the ticket names', () => {
    const commands = build();
    const ids = commands.map((command) => command.id);
    expect(ids).toContain('jump-to-chapter');
    expect(ids).toContain('bind-dictionaries');
    expect(ids).toContain('reload-dictionaries');
    expect(ids).toContain('add-proper-noun');
    expect(ids).toContain('switch-book:other.txt');
  });

  it('shows each row its direct shortcut, and none for rows that have no binding', () => {
    const commands = build();
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
    const commands = build();
    const bookIds = commands.filter((c) => c.group === 'Books').map((c) => c.id);
    expect(bookIds).toEqual(['switch-book:other.txt', 'switch-book:third.txt']);
  });

  it('runs the action the row names', () => {
    const reloadDictionary = vi.fn();
    const onSwitchBook = vi.fn();
    const commands = build({ actions: actions({ reloadDictionary }), onSwitchBook });
    commands.find((command) => command.id === 'reload-dictionaries')?.run();
    commands.find((command) => command.id === 'switch-book:third.txt')?.run();
    expect(reloadDictionary).toHaveBeenCalledTimes(1);
    expect(onSwitchBook).toHaveBeenCalledWith('third.txt');
  });

  it('hands an Add row the selection it was built with', () => {
    const quickAddCharacter = vi.fn();
    const commands = build({ actions: actions({ quickAddCharacter }), selection: '萧炎' });
    commands.find((command) => command.id === 'add-character')?.run();
    expect(quickAddCharacter).toHaveBeenCalledWith('萧炎');
  });

  it('names its action on every row but the book switches', () => {
    const commands = build();
    for (const command of commands) {
      if (command.group === 'Books') expect(command.action).toBeUndefined();
      else expect(command.action).toBeDefined();
    }
  });

  it('builds without books — a shelf of one still offers every other action', () => {
    const commands = build({ books: [] });
    expect(commands.some((command) => command.group === 'Books')).toBe(false);
    expect(commands.length).toBeGreaterThan(0);
  });
});

describe('filterPaletteCommands', () => {
  const commands = build();

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

  const commands = build();
  const hinted = commands.filter((command) => command.hint);

  it.each(hinted.map((command) => command.id))(
    '%s advertises the key that fires its action',
    (id) => {
      const command = hinted.find((candidate) => candidate.id === id);
      expect(
        matchHotkey(pressFor(command?.hint as string), {
          visibleTab: 'reader',
          ownTab: 'app',
          isInputFocused: false,
        })
      ).toEqual({ type: command?.action });
    }
  );

  it('gives every action row a hint', () => {
    const actionRows = commands.filter((command) => command.action).map((command) => command.id);
    expect(hinted.map((command) => command.id).sort()).toEqual(actionRows.sort());
  });
});

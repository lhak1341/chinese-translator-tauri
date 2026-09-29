import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { matchHotkey } from '../../utils/ui/HotkeyDispatchTable';

const modals = {
  openQuickAddCharacter: vi.fn(),
  openQuickAddPhrase: vi.fn(),
  openQuickAddProperNoun: vi.fn(),
  openQuickAddPattern: vi.fn(),
  openQuickAddCustomProperNoun: vi.fn(async () => {}),
  openQuickAddCustomStructuralPattern: vi.fn(async () => {}),
  dialog: null,
};

vi.mock('../useDictionaryModals', () => ({ useDictionaryModals: () => modals }));
vi.mock('../../components/BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView: async () => null }),
}));
vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries: {} }),
}));
vi.mock('../../utils/dictionary', () => ({
  requestDictionaryReload: vi.fn(async () => {}),
}));

import { useReaderCommands } from '../useReaderCommands';
import type { UseReaderCommandsOptions } from '../useReaderCommands';

function setup(overrides: Partial<UseReaderCommandsOptions> = {}) {
  const options: UseReaderCommandsOptions = {
    books: [
      { fileName: 'open.txt', title: 'Open' },
      { fileName: 'other.txt', title: 'Other' },
    ],
    currentFileName: 'open.txt',
    goToChapter: vi.fn(),
    openOutline: vi.fn(),
    pageBy: vi.fn(),
    openBindingDialog: vi.fn(),
    onSwitchBook: vi.fn(),
    ...overrides,
  };
  return { options, view: renderHook(() => useReaderCommands(options)) };
}

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

beforeEach(() => {
  for (const value of Object.values(modals)) {
    if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReaderCommands', () => {
  it('fires the same function from a palette row and from the key its hint names', () => {
    // "One action, one call site", as a test: the palette row, the hotkey and (for the
    // chapter keys) the strip button all reach `actions[id]`, never a copy of it.
    const { view } = setup();
    const { paletteCommands, hotkeyProps, actions } = view.result.current;

    const hinted = paletteCommands.filter((command) => command.hint);
    expect(hinted.length).toBeGreaterThan(0);
    for (const command of hinted) {
      const matched = matchHotkey(pressFor(command.hint as string), {
        visibleTab: 'reader',
        ownTab: hotkeyProps.ownTab,
        isInputFocused: false,
      });
      expect(matched?.type).toBe(command.action);
      expect(hotkeyProps.handlers[command.action as keyof typeof actions]).toBe(
        actions[command.action as keyof typeof actions]
      );
    }
  });

  it('owns Cmd+B: the key and the palette row both open the binding dialog', () => {
    const { view, options } = setup();
    const { paletteCommands, hotkeyProps } = view.result.current;

    void hotkeyProps.handlers.bindDictionaries?.();
    paletteCommands.find((command) => command.action === 'bindDictionaries')?.run();
    expect(options.openBindingDialog).toHaveBeenCalledTimes(2);
  });

  it('registers its hotkeys as the Reader, so they answer only while it shows', () => {
    expect(setup().view.result.current.hotkeyProps.ownTab).toBe('reader');
  });

  it('gives Add rows the selection captured when the palette opened', async () => {
    const selection = { toString: () => ' 萧炎 ', rangeCount: 0 };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
    const { view } = setup();

    await act(async () => {
      await view.result.current.actions.openCommandPalette();
    });
    expect(view.result.current.palette.isOpen).toBe(true);
    // Focusing the palette's search collapses the document selection.
    selection.toString = () => '';

    act(() =>
      view.result.current.paletteCommands.find((command) => command.id === 'add-character')?.run()
    );
    expect(modals.openQuickAddCharacter).toHaveBeenCalledWith('萧炎');
  });

  it('steps chapters and pages through the functions it was given', () => {
    const { view, options } = setup();
    const { actions } = view.result.current;

    actions.previousChapter();
    actions.nextChapter();
    actions.pageDown();
    actions.pageUp();
    actions.openChapterOutline();

    expect(options.goToChapter).toHaveBeenNthCalledWith(1, -1);
    expect(options.goToChapter).toHaveBeenNthCalledWith(2, 1);
    expect(options.pageBy).toHaveBeenNthCalledWith(1, 1);
    expect(options.pageBy).toHaveBeenNthCalledWith(2, -1);
    expect(options.openOutline).toHaveBeenCalledTimes(1);
  });
});

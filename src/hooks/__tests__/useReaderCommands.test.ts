import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { matchHotkey } from '../../utils/ui/HotkeyDispatchTable';
import type { HotkeyHandlerOptions } from '../useHotkeyHandler';

const modals = {
  showQuickAdd: false,
  quickAddDictionary: 'properNouns',
  clipboardText: '',
  openQuickAdd: vi.fn(),
  openQuickAddCharacter: vi.fn(),
  openQuickAddPhrase: vi.fn(),
  openQuickAddProperNoun: vi.fn(),
  openQuickAddPattern: vi.fn(),
  openQuickAddCustomProperNoun: vi.fn(async () => {}),
  openQuickAddCustomStructuralPattern: vi.fn(async () => {}),
  closeQuickAdd: vi.fn(),
  handleQuickAddDictionaryChange: vi.fn(),
};

vi.mock('../useDictionaryModals', () => ({ useDictionaryModals: () => modals }));
vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({
    dictionaries: {
      'properNouns-f_TapDo': {},
      'patterns-f_TapDo': {},
      'patterns-_Cultivation': {},
    },
  }),
}));
vi.mock('../../utils/dictionary', () => ({
  requestDictionaryReload: vi.fn(async () => {}),
}));

// Config as a failed binding apply leaves it: still pointing at the previous novel.
const appConfig = vi.hoisted(() => ({
  loadAppConfig: vi.fn(async () => ({
    ui: { defaultQuickAddDictionary: 'properNouns-f_Previous' },
    engine: {
      activeProperNouns: ['properNouns', 'properNouns-_Cultivation', 'properNouns-f_Previous'],
    },
  })),
}));
vi.mock('../../utils/appConfig', () => appConfig);

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../utils/toast', () => ({ default: toast }));

import { READER_HOTKEY_PROPS, useReaderCommands } from '../useReaderCommands';
import type { UseReaderCommandsOptions } from '../useReaderCommands';

function setup(overrides: Partial<UseReaderCommandsOptions> = {}) {
  const options: UseReaderCommandsOptions = {
    books: [
      { fileName: 'open.txt', title: 'Open' },
      { fileName: 'other.txt', title: 'Other' },
    ],
    currentFileName: 'open.txt',
    fictionDictionary: null,
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
      const prop = READER_HOTKEY_PROPS[command.action as keyof typeof READER_HOTKEY_PROPS];
      if (prop === null) continue; // registered by the tab container, not here
      expect(hotkeyProps[prop as keyof HotkeyHandlerOptions]).toBe(
        actions[command.action as keyof typeof actions]
      );
    }
  });

  it('leaves Cmd+B to the tab container, while the palette still offers it', () => {
    // `TabbedInterface` registers Cmd+B; a second registration here opens the dialog twice.
    const { view, options } = setup();
    const { paletteCommands, hotkeyProps } = view.result.current;

    expect(hotkeyProps).not.toHaveProperty('onBindDictionaries');
    paletteCommands.find((command) => command.action === 'bindDictionaries')?.run();
    expect(options.openBindingDialog).toHaveBeenCalledTimes(1);
  });

  it('registers its hotkeys as the Reader, so they answer only while it shows', () => {
    expect(setup().view.result.current.hotkeyProps.ownTab).toBe('reader');
  });

  it('gives Add rows the selection captured when the palette opened', () => {
    const selection = { toString: () => ' 萧炎 ' };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
    const { view } = setup();

    act(() => view.result.current.actions.openCommandPalette());
    expect(view.result.current.palette.isOpen).toBe(true);
    // Focusing the palette's search collapses the document selection.
    selection.toString = () => '';

    act(() =>
      view.result.current.paletteCommands.find((command) => command.id === 'add-character')?.run()
    );
    expect(modals.openQuickAddCharacter).toHaveBeenCalledWith('萧炎');
  });

  it("files a fiction Add under the book's own binding", async () => {
    const { view } = setup({ fictionDictionary: 'properNouns-f_TapDo' });

    await act(() => view.result.current.actions.quickAddCustomProperNoun('萧炎'));
    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));

    expect(modals.openQuickAdd).toHaveBeenCalledWith('properNouns-f_TapDo', '萧炎');
    expect(modals.openQuickAdd).toHaveBeenCalledWith('patterns-f_TapDo', 'X之Y');
    expect(modals.openQuickAddCustomProperNoun).not.toHaveBeenCalled();
  });

  it("an unbound book's proper noun never lands in the fiction config still names", async () => {
    const { view } = setup({ fictionDictionary: null });

    await act(() => view.result.current.actions.quickAddCustomProperNoun('萧炎'));

    // Config's own default is the previous novel's — stale for this book. The first active
    // non-fiction dictionary is the standing Configuration choice that still applies.
    expect(modals.openQuickAdd).toHaveBeenCalledWith('properNouns-_Cultivation', '萧炎');
    expect(modals.openQuickAddCustomProperNoun).not.toHaveBeenCalled();
  });

  it("an unbound book's structural pattern goes to the generic pair, like its proper noun", async () => {
    const { view } = setup({ fictionDictionary: null });

    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));

    expect(modals.openQuickAdd).toHaveBeenCalledWith('patterns-_Cultivation', 'X之Y');
    expect(toast.error).not.toHaveBeenCalled();
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

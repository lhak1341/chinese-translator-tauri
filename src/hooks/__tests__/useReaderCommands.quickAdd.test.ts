/**
 * The Reader's Adds through the real `useDictionaryModals` — its own file because
 * `useReaderCommands.test.ts` mocks that hook to spy on which opener each action runs.
 *
 * Config here is what a failed binding apply leaves: still naming the previous novel. The
 * Reader's quick-add view comes from the binding provider, which with a book open builds it
 * from the book's binding (`quickAddViewForBinding`, stubbed here as the provider composes
 * it), so neither the target nor the dropdown (`quickAddChoices` over the stored view) may
 * ever reach the previous novel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render } from '@testing-library/react';
import { quickAddChoices } from '../../utils/dictionary/QuickAddTarget';
import { registerSelectionMapper } from '../../utils/highlighting/SelectionMapping';

const dictionaries = vi.hoisted(() => ({
  properNouns: {},
  patterns: {},
  'properNouns-f_TapDo': {},
  'patterns-f_TapDo': {},
  'properNouns-f_Previous': {},
  'patterns-f_Previous': {},
  'properNouns-_Cultivation': {},
  'patterns-_Cultivation': {},
}));
vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaries, unreadDictionaryIds: [] }),
}));
vi.mock('../../utils/dictionary', () => ({
  requestDictionaryReload: vi.fn(async () => {}),
}));

const appConfig = vi.hoisted(() => ({
  loadAppConfig: vi.fn(async () => ({
    ui: { defaultQuickAddDictionary: 'properNouns-f_Previous' },
    engine: {
      activeProperNouns: ['properNouns', 'properNouns-_Cultivation', 'properNouns-f_Previous'],
    },
  })),
}));
vi.mock('../../utils/appConfig', () => appConfig);

// The open book's dictionary in use, as the provider would hold it.
const openBook = vi.hoisted(() => ({ bound: null as string | null }));
vi.mock('../../components/BookBindingContext', async () => {
  const { loadQuickAddConfig } = await vi.importActual<
    typeof import('../../utils/dictionary/QuickAddTarget')
  >('../../utils/dictionary/QuickAddTarget');
  const { quickAddViewForBinding } = await vi.importActual<
    typeof import('../../utils/reader/BindingActivation')
  >('../../utils/reader/BindingActivation');
  const loadQuickAddView = async () => quickAddViewForBinding(await loadQuickAddConfig(), openBook);
  return { useBookBinding: () => ({ loadQuickAddView }) };
});

// The Add form's Full line reads the engine; these tests never ask it.
vi.mock(import('../../components/EngineContext'), () => ({
  useEngine: () =>
    ({ engineAccess: { run: async () => null } }) as unknown as ReturnType<
      typeof import('../../components/EngineContext').useEngine
    >,
}));

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../utils/toast', () => ({ default: toast }));

// A stub form stands in for DictionaryEntry inside the Reader's quick-add dialog and records
// what the dialog hands it: what the open Add was opened on.
const form = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('../../components/dictionary/DictionaryEntry', () => ({
  default: (props: Record<string, unknown>) => {
    form.props = props;
    return null;
  },
}));

import { useReaderCommands } from '../useReaderCommands';
import type { UseReaderCommandsOptions } from '../useReaderCommands';
import type { ReaderActions } from '../../utils/reader/ReaderActions';

function setup(fictionDictionary: string | null) {
  openBook.bound = fictionDictionary;
  const options: UseReaderCommandsOptions = {
    shelf: {
      books: [{ fileName: 'open.txt', title: 'Open' }],
      switchBook: vi.fn(),
      reopenWithEncoding: vi.fn(),
    },
    currentFileName: 'open.txt',
    goToChapter: vi.fn(),
    openOutline: vi.fn(),
    pageBy: vi.fn(),
    openBindingDialog: vi.fn(),
  };
  const result = { current: null as unknown as ReturnType<typeof useReaderCommands> };
  function Reader() {
    const commands = useReaderCommands(options);
    result.current = commands;
    return React.createElement(React.Fragment, null, commands.quickAddDialog);
  }
  render(React.createElement(Reader));
  return { result };
}

/** What the open Add was opened on, as its form received it. */
function openAdd() {
  if (!form.props) throw new Error('no Add is open');
  return {
    dictionary: form.props.selectedDictionary as string,
    initialSource: form.props.initialSource as string,
    view: form.props.quickAddView as Parameters<typeof quickAddChoices>[0],
  };
}

/** The dropdown the open Add would show, over every dictionary that exists. */
function dropdownOf(quickAdd: { view: Parameters<typeof quickAddChoices>[0]; dictionary: string }) {
  return quickAddChoices(quickAdd.view, Object.keys(dictionaries), quickAdd.dictionary);
}

const ADDS: (keyof ReaderActions)[] = [
  'quickAddCharacter',
  'quickAddPhrase',
  'quickAddProperNoun',
  'quickAddPattern',
  'quickAddCustomProperNoun',
  'quickAddCustomStructuralPattern',
];

beforeEach(() => {
  vi.clearAllMocks();
  form.props = null;
});

describe("useReaderCommands — Adds decide over the book's binding", () => {
  it("files a fiction Add under the book's own binding", async () => {
    const view = setup('properNouns-f_TapDo');

    await act(() => view.result.current.actions.quickAddCustomProperNoun('萧炎'));
    expect(openAdd().dictionary).toBe('properNouns-f_TapDo');
    expect(openAdd().initialSource).toBe('萧炎');

    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));
    expect(openAdd().dictionary).toBe('patterns-f_TapDo');
  });

  it.each(ADDS)(
    "%s's dropdown offers the bound novel and never the one stale config names",
    async (action) => {
      const view = setup('properNouns-f_TapDo');

      await act(async () => {
        await view.result.current.actions[action]('萧炎');
      });

      const dropdown = dropdownOf(openAdd());
      expect(dropdown).toContain('properNouns-f_TapDo');
      expect(dropdown).toContain('patterns-f_TapDo');
      // The non-fiction dictionaries config keeps active stay offered: the binding replaces
      // only the fiction slice.
      expect(dropdown).toContain('properNouns');
      expect(dropdown).toContain('properNouns-_Cultivation');
      expect(dropdown).toContain('patterns-_Cultivation');
      expect(dropdown).not.toContain('properNouns-f_Previous');
      expect(dropdown).not.toContain('patterns-f_Previous');
    }
  );

  it("an unbound book's proper noun never lands in the fiction config still names", async () => {
    const view = setup(null);

    await act(() => view.result.current.actions.quickAddCustomProperNoun('萧炎'));

    // Config's own default is the previous novel's — stale for this book. The first active
    // non-fiction dictionary is the standing Configuration choice that still applies.
    expect(openAdd().dictionary).toBe('properNouns-_Cultivation');
    expect(dropdownOf(openAdd())).not.toContain('properNouns-f_Previous');
  });

  it("an unbound book's structural pattern goes to the generic pair, like its proper noun", async () => {
    const view = setup(null);

    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));

    expect(openAdd().dictionary).toBe('patterns-_Cultivation');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a palette Add over a Translation-panel selection starts from its Chinese, like the key', async () => {
    // The Reader's Translation panel holds Vietnamese; its mapper gives the Chinese back.
    const text = document.createTextNode('Tiêu Viêm');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.length);
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Tiêu Viêm',
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection);
    const unregister = registerSelectionMapper(() => ({ kind: 'mapped', source: '萧炎' }));
    const view = setup('properNouns-f_TapDo');

    await act(async () => {
      await view.result.current.actions.openCommandPalette();
    });
    await act(async () => {
      view.result.current.paletteCommands
        .find((command) => command.id === 'add-proper-noun')
        ?.run();
    });
    unregister();

    expect(openAdd().initialSource).toBe('萧炎');
  });
});

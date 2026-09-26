/**
 * The Reader's Adds through the real `useDictionaryModals` — its own file because
 * `useReaderCommands.test.ts` mocks that hook to spy on which opener each action runs.
 *
 * Config here is what a failed binding apply leaves: still naming the previous novel. The
 * Reader's quick-add view comes from the open book's binding, so neither the target nor the
 * dropdown (`quickAddChoices` over the stored view) may ever reach the previous novel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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
  useDictionary: () => ({ dictionaries }),
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

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../utils/toast', () => ({ default: toast }));

import { useReaderCommands } from '../useReaderCommands';
import type { UseReaderCommandsOptions } from '../useReaderCommands';
import type { ReaderActions } from '../../utils/reader/ReaderActions';

function setup(fictionDictionary: string | null) {
  const options: UseReaderCommandsOptions = {
    books: [{ fileName: 'open.txt', title: 'Open' }],
    currentFileName: 'open.txt',
    fictionDictionary,
    goToChapter: vi.fn(),
    openOutline: vi.fn(),
    pageBy: vi.fn(),
    openBindingDialog: vi.fn(),
    onSwitchBook: vi.fn(),
  };
  return renderHook(() => useReaderCommands(options));
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
});

describe("useReaderCommands — Adds decide over the book's binding", () => {
  it("files a fiction Add under the book's own binding", async () => {
    const view = setup('properNouns-f_TapDo');

    await act(() => view.result.current.actions.quickAddCustomProperNoun('萧炎'));
    expect(view.result.current.quickAdd.dictionary).toBe('properNouns-f_TapDo');
    expect(view.result.current.quickAdd.initialSource).toBe('萧炎');

    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));
    expect(view.result.current.quickAdd.dictionary).toBe('patterns-f_TapDo');
  });

  it.each(ADDS)(
    "%s's dropdown offers the bound novel and never the one stale config names",
    async (action) => {
      const view = setup('properNouns-f_TapDo');

      await act(async () => {
        await view.result.current.actions[action]('萧炎');
      });

      const dropdown = dropdownOf(view.result.current.quickAdd);
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
    expect(view.result.current.quickAdd.dictionary).toBe('properNouns-_Cultivation');
    expect(dropdownOf(view.result.current.quickAdd)).not.toContain('properNouns-f_Previous');
  });

  it("an unbound book's structural pattern goes to the generic pair, like its proper noun", async () => {
    const view = setup(null);

    await act(() => view.result.current.actions.quickAddCustomStructuralPattern('X之Y'));

    expect(view.result.current.quickAdd.dictionary).toBe('patterns-_Cultivation');
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

    expect(view.result.current.quickAdd.initialSource).toBe('萧炎');
  });
});

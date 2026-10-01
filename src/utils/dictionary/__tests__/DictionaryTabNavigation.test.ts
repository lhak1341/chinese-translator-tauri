import { describe, expect, test, vi } from 'vitest';
import { dictionaryTabNavigation } from '../DictionaryTabNavigation';
import type { QuickAddView } from '../QuickAddTarget';

function run(
  key: string,
  {
    view = null,
    dictionaries = {},
    unread = [],
  }: {
    view?: QuickAddView | null;
    dictionaries?: Record<string, unknown>;
    unread?: string[];
  } = {}
) {
  const loadView = vi.fn(async () => view);
  return {
    loadView,
    result: dictionaryTabNavigation(key, { loadView, dictionaries, unreadDictionaryIds: unread }),
  };
}

describe('Cmd-1..4', () => {
  test.each([
    ['1', 'characters'],
    ['2', 'phrases'],
    ['3', 'properNouns'],
    ['4', 'patterns'],
  ])('%s selects %s without reading config', async (key, dictionaryId) => {
    const { result, loadView } = run(key);
    expect(await result).toEqual({ kind: 'select', dictionaryId });
    expect(loadView).not.toHaveBeenCalled();
  });
});

describe('a key that is not one of the six digits', () => {
  test.each(['0', '7', 'a', ''])('%j is not ours', async (key) => {
    const { result, loadView } = run(key);
    expect(await result).toBeNull();
    expect(loadView).not.toHaveBeenCalled();
  });
});

describe('Cmd-5 (proper noun quick nav)', () => {
  test('selects the quick-add default when it is active', async () => {
    const { result } = run('5', {
      view: {
        activeProperNouns: ['properNouns', 'properNouns-_Theme'],
        defaultQuickAddDictionary: 'properNouns-_Theme',
      },
    });
    expect(await result).toEqual({ kind: 'select', dictionaryId: 'properNouns-_Theme' });
  });

  test('with nothing usable, selects the root proper-nouns table, as the Translator does', async () => {
    const { result } = run('5', {
      view: { activeProperNouns: ['properNouns'], defaultQuickAddDictionary: null },
    });
    expect(await result).toEqual({ kind: 'select', dictionaryId: 'properNouns' });
  });
});

describe('Cmd-6 (structural pattern quick nav)', () => {
  const novel: QuickAddView = {
    activeProperNouns: ['properNouns-f_Novel'],
    defaultQuickAddDictionary: 'properNouns-f_Novel',
  };

  test('selects the resolved patterns dictionary when it is loaded', async () => {
    const { result } = run('6', { view: novel, dictionaries: { 'patterns-f_Novel': {} } });
    expect(await result).toEqual({ kind: 'select', dictionaryId: 'patterns-f_Novel' });
  });

  test('is refused, naming the file, when the resolved dictionary is not loaded', async () => {
    const { result } = run('6', { view: novel });
    expect(await result).toEqual({
      kind: 'refused',
      message: 'The structural pattern dictionary patterns-f_Novel is missing',
    });
  });

  test('says it could not be read, not that it is missing, when its file failed to load', async () => {
    const { result } = run('6', { view: novel, unread: ['patterns-f_Novel'] });
    expect(await result).toEqual({
      kind: 'refused',
      message:
        "Couldn't read the structural pattern dictionary patterns-f_Novel. Fix the file, then Reload.",
    });
  });

  test('selects root patterns when no paired proper-nouns dictionary is active', async () => {
    const { result } = run('6', {
      view: { activeProperNouns: ['properNouns'], defaultQuickAddDictionary: null },
      dictionaries: { 'patterns-f_Unrelated': {} },
    });
    expect(await result).toEqual({ kind: 'select', dictionaryId: 'patterns' });
  });

  test('with no config at all, selects root patterns', async () => {
    const { result } = run('6', { view: null });
    expect(await result).toEqual({ kind: 'select', dictionaryId: 'patterns' });
  });
});

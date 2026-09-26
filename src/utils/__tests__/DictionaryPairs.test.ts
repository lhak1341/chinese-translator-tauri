import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createDictionary,
  renameDictionary,
  createMissingPatternHalves,
} from '../dictionary/DictionaryPairs';

vi.mock('../appConfig', () => ({
  callRustConfigWrite: <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));

const api = {
  createFictionDictionaryPair: vi.fn(),
  createProperNounsDictionary: vi.fn(),
  renameProperNounsDictionary: vi.fn(),
  listFictionPatternDictionaries: vi.fn(),
  createStructuralPatternsDictionary: vi.fn(),
};

/** Fake DictionaryContext ops that record the order memory changed in. */
function fakeOps() {
  const events: string[] = [];
  return {
    events,
    ops: {
      loadDictionary: vi.fn(async (id: string) => {
        events.push(`load ${id}`);
      }),
      removeDictionaryKey: vi.fn((id: string) => {
        events.push(`remove ${id}`);
      }),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { electronAPI: api });
  for (const fn of Object.values(api)) fn.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('createDictionary', () => {
  test.each([
    ['fiction', 'properNouns-f_Novel', ['load properNouns-f_Novel', 'load patterns-f_Novel']],
    ['generic', 'properNouns-_Theme', ['load properNouns-_Theme', 'load patterns-_Theme']],
  ])('a %s dictionary is created as a pair and both halves load', async (_, id, loads) => {
    const result = { success: true, dictionaries: ['properNouns', id] };
    api.createFictionDictionaryPair.mockResolvedValue(result);
    const { ops, events } = fakeOps();

    expect(await createDictionary(id, ops)).toBe(result);
    expect(api.createFictionDictionaryPair).toHaveBeenCalledWith(id);
    expect(api.createProperNounsDictionary).not.toHaveBeenCalled();
    expect(events).toEqual(loads);
  });

  test('a custom dictionary is a single file and only it loads', async () => {
    api.createProperNounsDictionary.mockResolvedValue({ success: true });
    const { ops, events } = fakeOps();

    await createDictionary('properNouns-Mine', ops);

    expect(api.createFictionDictionaryPair).not.toHaveBeenCalled();
    expect(events).toEqual(['load properNouns-Mine']);
  });

  test('a failed create loads nothing and returns the failure', async () => {
    api.createFictionDictionaryPair.mockResolvedValue({ success: false, error: 'exists' });
    const { ops, events } = fakeOps();

    expect(await createDictionary('properNouns-_Theme', ops)).toEqual({
      success: false,
      error: 'exists',
    });
    expect(events).toEqual([]);
  });
});

describe('renameDictionary', () => {
  test('a pair loads each new half before dropping its old one', async () => {
    api.renameProperNounsDictionary.mockResolvedValue({ success: true });
    const { ops, events } = fakeOps();

    expect(await renameDictionary('properNouns-_Old', 'properNouns-_New', ops)).toEqual({
      success: true,
    });
    expect(events).toEqual([
      'load properNouns-_New',
      'remove properNouns-_Old',
      'load patterns-_New',
      'remove patterns-_Old',
    ]);
  });

  test('a custom dictionary moves only itself', async () => {
    api.renameProperNounsDictionary.mockResolvedValue({ success: true });
    const { ops, events } = fakeOps();

    await renameDictionary('properNouns-Old', 'properNouns-New', ops);

    expect(events).toEqual(['load properNouns-New', 'remove properNouns-Old']);
  });

  test('a failed rename touches nothing in memory', async () => {
    api.renameProperNounsDictionary.mockResolvedValue({ success: false, error: 'taken' });
    const { ops, events } = fakeOps();

    expect(await renameDictionary('properNouns-f_A', 'properNouns-f_B', ops)).toEqual({
      success: false,
      error: 'taken',
    });
    expect(events).toEqual([]);
  });
});

describe('createMissingPatternHalves', () => {
  test('creates and loads only the missing patterns halves of paired dictionaries', async () => {
    api.listFictionPatternDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['patterns-f_Has'],
    });
    api.createStructuralPatternsDictionary.mockResolvedValue({ success: true });
    const { ops, events } = fakeOps();

    await createMissingPatternHalves(
      [
        'properNouns',
        'properNouns-Mine',
        'properNouns-f_Has',
        'properNouns-f_Lacks',
        'properNouns-_Theme',
      ],
      ops
    );

    expect(api.createStructuralPatternsDictionary.mock.calls.map(([id]) => id)).toEqual([
      'patterns-f_Lacks',
      'patterns-_Theme',
    ]);
    expect(events).toEqual(['load patterns-f_Lacks', 'load patterns-_Theme']);
  });

  test('a failure only logs — the proper-nouns halves work without it', async () => {
    api.listFictionPatternDictionaries.mockRejectedValue(new Error('disk'));
    const { ops } = fakeOps();

    await expect(createMissingPatternHalves(['properNouns-f_A'], ops)).resolves.toBeUndefined();
    expect(api.createStructuralPatternsDictionary).not.toHaveBeenCalled();
  });
});

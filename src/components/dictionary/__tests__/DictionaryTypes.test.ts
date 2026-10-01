/**
 * `getDictionaryTypes` lists the proper-nouns and pattern dictionaries that exist. A failed
 * list — whether the command reports `success: false` or the call rejects — must say so and
 * leave the built-in set, `properNouns` included, rather than silently showing a shorter one.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getDictionaryTypes } from '../DictionaryTypes';

const toastWarning = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/toast', () => ({ default: { warning: toastWarning } }));
vi.mock('../../../utils/logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function installApi(api: {
  listProperNounsDictionaries: () => Promise<unknown>;
  listFictionPatternDictionaries: () => Promise<unknown>;
}) {
  (window as unknown as { electronAPI: unknown }).electronAPI = api;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDictionaryTypes', () => {
  test('lists every dictionary that exists, with its pattern halves', async () => {
    installApi({
      listProperNounsDictionaries: async () => ({
        success: true,
        dictionaries: ['properNouns', 'properNouns-f_TapDo'],
      }),
      listFictionPatternDictionaries: async () => ({
        success: true,
        dictionaries: ['patterns-f_TapDo'],
      }),
    });

    const types = await getDictionaryTypes();

    expect(Object.keys(types)).toEqual(
      expect.arrayContaining(['properNouns', 'properNouns-f_TapDo', 'patterns-f_TapDo', 'phrases'])
    );
    expect(types['properNouns-f_TapDo'].label).toBe('Proper Nouns - f_TapDo');
    expect(toastWarning).not.toHaveBeenCalled();
  });

  test.each([
    [
      'a list that reports failure',
      {
        listProperNounsDictionaries: async () => ({ success: false, error: 'disk' }),
        listFictionPatternDictionaries: async () => ({ success: true, dictionaries: [] }),
      },
    ],
    [
      'a pattern list that reports failure',
      {
        listProperNounsDictionaries: async () => ({ success: true, dictionaries: ['properNouns'] }),
        listFictionPatternDictionaries: async () => ({ success: false, error: 'disk' }),
      },
    ],
    [
      'a list that rejects',
      {
        listProperNounsDictionaries: async () => {
          throw new Error('ipc');
        },
        listFictionPatternDictionaries: async () => ({ success: true, dictionaries: [] }),
      },
    ],
  ])('%s warns and keeps the built-in set, properNouns included', async (_name, api) => {
    installApi(api);

    const types = await getDictionaryTypes();

    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(Object.keys(types)).toEqual(
      expect.arrayContaining(['properNouns', 'phrases', 'characters'])
    );
  });
});

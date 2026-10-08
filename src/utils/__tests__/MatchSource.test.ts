/**
 * openMatchSource is the one module between the engine and the two ways to find the
 * dictionary matches at a token: the Rust lookup index and the JS trie. It owns the skip rules,
 * the conversion to Rust's dictionary shape (with each dictionary's real priority), reading the
 * index back in precedence order, and the three-failure fallback with its one toast. Tests cross
 * its interface and fake the seam, `tauriAPI.buildLookupIndex`. What counts as a correct answer
 * is MatchSource.parity.test.ts's job.
 *
 * The failure count is module state, so each test imports a fresh copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBuildLookupIndex, mockToastWarning } = vi.hoisted(() => ({
  mockBuildLookupIndex: vi.fn(),
  mockToastWarning: vi.fn(),
}));

global.window.electronAPI = {
  buildLookupIndex: mockBuildLookupIndex,
} as unknown as typeof window.electronAPI;
vi.mock('../toast', () => ({ default: { warning: mockToastWarning } }));
vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const LONG_TEXT = '测'.repeat(60); // >= MIN_TEXT_FOR_RUST_INDEX (50)
const SHORT_TEXT = '测试';
const ENTRY = { chinese: '你', vietnamese: 'bạn', metadata: null };
const SUCCESS = { success: true, index: {}, buildTimeMs: 1, positionsIndexed: 0, indexSize: 0 };
const FAILURE = { success: false, error: 'Rust build failed' };

type Match = { word: string; dictionary?: string; priority?: number };

function token(value: string, start: number, type = 'chinese_char') {
  return { type, value, start, end: start + value.length, translated: null };
}
const TOKENS = [token('天', 0), token('道', 1), token('，', 2, 'punctuation'), token('大', 3)];

function makeDictionaryManager(overrides: Record<string, unknown> = {}) {
  return {
    flatEntries: new Map([['characters', [ENTRY]]]),
    getDefaultSearchOrder: vi.fn(() => ['characters']),
    getPriorityForDictionary: vi.fn(() => 1),
    findAllMatches: vi.fn((): Match[] => []),
    ...overrides,
  };
}

async function load(dictionaryManager = makeDictionaryManager()) {
  vi.resetModules();
  const { openMatchSource } = await import('../dictionary/MatchSource');
  const logWarn = vi.fn();
  const open = (text: string) => openMatchSource(text, { dictionaryManager, logWarn } as never);
  return { open, logWarn, dictionaryManager };
}

beforeEach(() => {
  mockBuildLookupIndex.mockReset();
  mockBuildLookupIndex.mockResolvedValue(SUCCESS);
  mockToastWarning.mockReset();
});

describe('openMatchSource — when it does not call Rust', () => {
  it('skips text shorter than MIN_TEXT_FOR_RUST_INDEX', async () => {
    const { open } = await load();
    await open(SHORT_TEXT);
    expect(mockBuildLookupIndex).not.toHaveBeenCalled();
  });

  it('skips text with an astral character: the index is keyed by code point, tokens by UTF-16', async () => {
    const { open } = await load();
    await open('😀' + LONG_TEXT);
    expect(mockBuildLookupIndex).not.toHaveBeenCalled();
  });
});

describe('openMatchSource — what it sends', () => {
  it('sends the text, the dictionaries, the order and the length gate', async () => {
    const { open } = await load();
    await open(LONG_TEXT);
    expect(mockBuildLookupIndex).toHaveBeenCalledWith(
      LONG_TEXT,
      [{ name: 'characters', entries: [ENTRY], priority: 1 }],
      ['characters'],
      50
    );
  });

  async function sentDictionaries(dictionaryManager: ReturnType<typeof makeDictionaryManager>) {
    const { open } = await load(dictionaryManager);
    await open(LONG_TEXT);
    return mockBuildLookupIndex.mock.calls[0][1];
  }

  it("uses each dictionary's real priority, not its position in the order", async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({
        flatEntries: new Map([
          ['properNouns-f_A', [ENTRY]],
          ['properNouns-f_B', [ENTRY]],
          ['phrases', [ENTRY]],
        ]),
        getDefaultSearchOrder: vi.fn(() => ['properNouns-f_A', 'properNouns-f_B', 'phrases']),
        getPriorityForDictionary: vi.fn((name: string) =>
          name.startsWith('properNouns-f_') ? 1 : 10
        ),
      })
    );

    expect(sent.map((d: { priority: number }) => d.priority)).toEqual([1, 1, 10]);
  });

  it("keeps the search order regardless of the map's insertion order", async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({
        flatEntries: new Map([
          ['phrases', [ENTRY]],
          ['characters', [ENTRY]],
        ]),
        getDefaultSearchOrder: vi.fn(() => ['characters', 'phrases']),
      })
    );

    expect(sent.map((d: { name: string }) => d.name)).toEqual(['characters', 'phrases']);
  });

  it('skips a name in the order that has no entries', async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({
        getDefaultSearchOrder: vi.fn(() => ['characters', 'missing-dictionary']),
      })
    );

    expect(sent.map((d: { name: string }) => d.name)).toEqual(['characters']);
  });

  it('sends no dictionaries when the search order is empty', async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({ getDefaultSearchOrder: vi.fn(() => []) })
    );

    expect(sent).toEqual([]);
  });
});

describe('openMatchSource — reading a built index', () => {
  async function indexed(index: Record<number, Record<string, Match[]>>) {
    mockBuildLookupIndex.mockResolvedValue({ ...SUCCESS, index });
    const { open, dictionaryManager } = await load();
    return { source: await open(LONG_TEXT), dictionaryManager };
  }
  const inProperNouns = (...matches: Match[]) =>
    matches.map((match) => ({ dictionary: 'properNouns', ...match }));

  it("reads the token's text position, as a number key, and never touches the trie", async () => {
    const { source, dictionaryManager } = await indexed({
      3: { properNouns: inProperNouns({ word: '大道', priority: 1 }) },
    });
    const matchesAt = source.forPhase(['properNouns']);

    expect(matchesAt(TOKENS as never, 3, 'properNouns').map((m) => m.word)).toEqual(['大道']);
    expect(matchesAt(TOKENS as never, 0, 'properNouns')).toEqual([]);
    expect(dictionaryManager.findAllMatches).not.toHaveBeenCalled();
  });

  it('returns nothing for a category the position has no matches in', async () => {
    const { source } = await indexed({
      0: { characters: [{ word: '天', dictionary: 'characters' }] },
    });
    expect(source.forPhase(['properNouns'])(TOKENS as never, 0, 'properNouns')).toEqual([]);
  });

  it("keeps only the matches from the phase's own dictionaries", async () => {
    const { source } = await indexed({
      0: {
        phrases: [
          { word: '天道', dictionary: 'phrases', priority: 3 },
          { word: '天道行', dictionary: 'customDict', priority: 10 },
        ],
      },
    });

    const matchesAt = (order: string[]) => source.forPhase(order)(TOKENS as never, 0, 'phrases');
    expect(matchesAt(['phrases']).map((m) => m.word)).toEqual(['天道']);
    expect(matchesAt(['phrases', 'customDict']).map((m) => m.word)).toEqual(['天道行', '天道']);
  });

  it('sorts longer first', async () => {
    const { source } = await indexed({
      0: { properNouns: inProperNouns({ word: '天', priority: 1 }, { word: '天道', priority: 2 }) },
    });
    const result = source.forPhase(['properNouns'])(TOKENS as never, 0, 'properNouns');
    expect(result.map((m) => m.word)).toEqual(['天道', '天']);
  });

  it('on equal length, the lower priority number wins', async () => {
    const { source } = await indexed({
      0: {
        properNouns: inProperNouns({ word: '大道', priority: 5 }, { word: '天道', priority: 1 }),
      },
    });
    const result = source.forPhase(['properNouns'])(TOKENS as never, 0, 'properNouns');
    expect(result[0].word).toBe('天道');
  });

  it('treats a missing priority as 0', async () => {
    const { source } = await indexed({
      0: { properNouns: inProperNouns({ word: '大道', priority: 1 }, { word: '天道' }) },
    });
    const result = source.forPhase(['properNouns'])(TOKENS as never, 0, 'properNouns');
    expect(result[0].word).toBe('天道');
  });
});

describe('openMatchSource — reading the JS trie', () => {
  it('asks the trie for the text that follows the token, up to the next punctuation', async () => {
    const dictionaryManager = makeDictionaryManager({
      findAllMatches: vi.fn(() => [{ word: '天道', dictionary: 'properNouns' }]),
    });
    const { open } = await load(dictionaryManager);
    const source = await open(SHORT_TEXT);

    const result = source.forPhase(['properNouns'])(TOKENS as never, 0, 'properNouns');

    expect(dictionaryManager.findAllMatches).toHaveBeenCalledWith('天道', 0, ['properNouns']);
    expect(result).toEqual([{ word: '天道', dictionary: 'properNouns' }]);
  });

  it('returns nothing for a position past the last token', async () => {
    const { open, dictionaryManager } = await load();
    const source = await open(SHORT_TEXT);
    expect(source.forPhase(['properNouns'])(TOKENS as never, 9, 'properNouns')).toEqual([]);
    expect(dictionaryManager.findAllMatches).not.toHaveBeenCalled();
  });

  it('reads the trie after a failed build', async () => {
    mockBuildLookupIndex.mockResolvedValue(FAILURE);
    const { open, dictionaryManager } = await load();
    const source = await open(LONG_TEXT);

    source.forPhase(['characters'])(TOKENS as never, 0, 'characters');

    expect(dictionaryManager.findAllMatches).toHaveBeenCalledTimes(1);
  });

  it('reads the trie, and warns once, after a build that throws', async () => {
    mockBuildLookupIndex.mockRejectedValue(new Error('Rust panic'));
    const { open, logWarn, dictionaryManager } = await load();
    const source = await open(LONG_TEXT);

    source.forPhase(['characters'])(TOKENS as never, 0, 'characters');

    expect(dictionaryManager.findAllMatches).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Rust panic'));
  });
});

describe('openMatchSource — repeated failures', () => {
  it('stops building after three consecutive failures and toasts once', async () => {
    const { open } = await load();
    mockBuildLookupIndex.mockResolvedValue(FAILURE);

    for (let i = 0; i < 5; i++) await open(LONG_TEXT);

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(3);
    expect(mockToastWarning).toHaveBeenCalledTimes(1);
    expect(mockToastWarning).toHaveBeenCalledWith(
      'High-performance indexing unavailable. Large texts may translate slower.',
      { duration: 5000, id: 'rust-index-unavailable' }
    );
  });

  it('counts a thrown build like a failed one', async () => {
    const { open } = await load();
    mockBuildLookupIndex.mockRejectedValue(new Error('Tauri command not found'));

    for (let i = 0; i < 4; i++) await open(LONG_TEXT);

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(3);
    expect(mockToastWarning).toHaveBeenCalledTimes(1);
  });

  it('a success resets the count, so non-consecutive failures never stop the build', async () => {
    const { open } = await load();
    mockBuildLookupIndex
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(SUCCESS)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(SUCCESS);

    for (let i = 0; i < 6; i++) await open(LONG_TEXT);

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(6);
    expect(mockToastWarning).not.toHaveBeenCalled();
  });
});

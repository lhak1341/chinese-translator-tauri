/**
 * buildLookupIndexOrFallback is the one module between the engine and the Rust index build:
 * it owns the skip rules, the conversion to Rust's dictionary shape (with each dictionary's
 * real priority), the Map result, and the three-failure fallback with its one toast. Tests
 * cross its interface and fake the seam, `tauriAPI.buildLookupIndex`.
 *
 * The failure count is module state, so each test imports a fresh copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBuildLookupIndex, mockToastWarning } = vi.hoisted(() => ({
  mockBuildLookupIndex: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('../../tauriAPI', () => ({
  default: { buildLookupIndex: mockBuildLookupIndex },
}));
vi.mock('../toast', () => ({ default: { warning: mockToastWarning } }));
vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const LONG_TEXT = '测'.repeat(60); // >= MIN_TEXT_FOR_RUST_INDEX (50)
const SHORT_TEXT = '测试';
const ENTRY = { chinese: '你', vietnamese: 'bạn', metadata: null };
const SUCCESS = { success: true, index: {}, buildTimeMs: 1, positionsIndexed: 0, indexSize: 0 };
const FAILURE = { success: false, error: 'Rust build failed' };

type Options = Record<string, unknown>;

function makeDictionaryManager(overrides: Record<string, unknown> = {}) {
  return {
    flatEntries: new Map([['characters', [ENTRY]]]),
    getDefaultSearchOrder: vi.fn(() => ['characters']),
    getPriorityForDictionary: vi.fn(() => 1),
    ...overrides,
  };
}

async function loadBuilder() {
  vi.resetModules();
  const { buildLookupIndexOrFallback } = await import('../dictionary/LookupIndexBuilder');
  const logDebug = vi.fn();
  const logWarn = vi.fn();
  const build = (text: string, options: Options, dictionaryManager = makeDictionaryManager()) =>
    buildLookupIndexOrFallback(text, options, { dictionaryManager, logDebug, logWarn } as never);
  return { build, logDebug, logWarn };
}

beforeEach(() => {
  mockBuildLookupIndex.mockReset();
  mockBuildLookupIndex.mockResolvedValue(SUCCESS);
  mockToastWarning.mockReset();
});

describe('buildLookupIndexOrFallback — when it does nothing', () => {
  it('skips when options.lookupIndex is already set', async () => {
    const { build } = await loadBuilder();
    await build(LONG_TEXT, { lookupIndex: new Map() });
    expect(mockBuildLookupIndex).not.toHaveBeenCalled();
  });

  it('skips text shorter than MIN_TEXT_FOR_RUST_INDEX', async () => {
    const { build } = await loadBuilder();
    const options: Options = {};
    await build(SHORT_TEXT, options);
    expect(mockBuildLookupIndex).not.toHaveBeenCalled();
    expect(options.lookupIndex).toBeUndefined();
  });

  it('skips when useSharedLookupIndex is explicitly false', async () => {
    const { build } = await loadBuilder();
    await build(LONG_TEXT, { useSharedLookupIndex: false });
    expect(mockBuildLookupIndex).not.toHaveBeenCalled();
  });
});

describe('buildLookupIndexOrFallback — a successful build', () => {
  it('sets lookupIndex as a number-keyed Map and marks the index shared', async () => {
    const { build, logDebug } = await loadBuilder();
    const options: Options = {};
    mockBuildLookupIndex.mockResolvedValue({
      ...SUCCESS,
      index: { 0: { characters: [{ word: '测', translation: 'test' }] } },
      positionsIndexed: 60,
      indexSize: 1,
    });

    await build(LONG_TEXT, options);

    expect(options.lookupIndex).toBeInstanceOf(Map);
    expect((options.lookupIndex as Map<number, unknown>).get(0)).toEqual({
      characters: [{ word: '测', translation: 'test' }],
    });
    expect(options.useSharedLookupIndex).toBe(true);
    expect(logDebug).toHaveBeenCalledTimes(1);
  });

  it('sends the text, the dictionaries and the order, and leaves the options to Rust', async () => {
    const { build } = await loadBuilder();
    await build(LONG_TEXT, {});
    expect(mockBuildLookupIndex).toHaveBeenCalledWith(
      LONG_TEXT,
      [{ name: 'characters', entries: [ENTRY], priority: 1 }],
      ['characters']
    );
  });
});

describe('buildLookupIndexOrFallback — conversion to Rust dictionaries', () => {
  async function sentDictionaries(dictionaryManager: ReturnType<typeof makeDictionaryManager>) {
    const { build } = await loadBuilder();
    await build(LONG_TEXT, {}, dictionaryManager);
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

  it('accepts a plain object of entries as well as a Map', async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({ flatEntries: { characters: [ENTRY] } })
    );

    expect(sent).toEqual([{ name: 'characters', entries: [ENTRY], priority: 1 }]);
  });

  it('sends no dictionaries when the search order is empty', async () => {
    const sent = await sentDictionaries(
      makeDictionaryManager({ getDefaultSearchOrder: vi.fn(() => []) })
    );

    expect(sent).toEqual([]);
  });
});

describe('buildLookupIndexOrFallback — failures', () => {
  it('leaves the options untouched when Rust reports a failed build', async () => {
    const { build } = await loadBuilder();
    const options: Options = {};
    mockBuildLookupIndex.mockResolvedValue(FAILURE);

    await build(LONG_TEXT, options);

    expect(options.lookupIndex).toBeUndefined();
    expect(options.useSharedLookupIndex).toBeUndefined();
  });

  it('leaves the options untouched and warns once when the build throws', async () => {
    const { build, logWarn } = await loadBuilder();
    const options: Options = {};
    mockBuildLookupIndex.mockRejectedValue(new Error('Rust panic'));

    await build(LONG_TEXT, options);

    expect(options.lookupIndex).toBeUndefined();
    expect(options.useSharedLookupIndex).toBeUndefined();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Rust panic'));
  });

  it('stops building after three consecutive failures and toasts once', async () => {
    const { build } = await loadBuilder();
    mockBuildLookupIndex.mockResolvedValue(FAILURE);

    for (let i = 0; i < 5; i++) await build(LONG_TEXT, {});

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(3);
    expect(mockToastWarning).toHaveBeenCalledTimes(1);
    expect(mockToastWarning).toHaveBeenCalledWith(
      'High-performance indexing unavailable. Large texts may translate slower.',
      { duration: 5000, id: 'rust-index-unavailable' }
    );
  });

  it('counts a thrown build like a failed one', async () => {
    const { build } = await loadBuilder();
    mockBuildLookupIndex.mockRejectedValue(new Error('Tauri command not found'));

    for (let i = 0; i < 3; i++) await build(LONG_TEXT, {});
    await build(LONG_TEXT, {});

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(3);
    expect(mockToastWarning).toHaveBeenCalledTimes(1);
  });

  it('a success resets the count, so non-consecutive failures never stop the build', async () => {
    const { build } = await loadBuilder();
    mockBuildLookupIndex
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(SUCCESS)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(FAILURE)
      .mockResolvedValueOnce(SUCCESS);

    for (let i = 0; i < 6; i++) await build(LONG_TEXT, {});

    expect(mockBuildLookupIndex).toHaveBeenCalledTimes(6);
    expect(mockToastWarning).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLookupIndexOrFallback } from '../dictionary/LookupIndexBuilder';

const mockRustLookupIndexManager = {
  isAvailable: vi.fn(),
  buildLookupIndex: vi.fn(),
};

vi.mock('../RustLookupIndexManager.js', () => ({
  rustLookupIndexManager: mockRustLookupIndexManager,
}));

const LONG_TEXT = '测'.repeat(60); // >= MIN_TEXT_FOR_RUST_INDEX (50)
const SHORT_TEXT = '测试';

function makeDictionaryManager(overrides = {}) {
  return {
    flatEntries: {},
    getDefaultSearchOrder: vi.fn(() => ['characters']),
    getPriorityForDictionary: vi.fn(() => 1),
    ...overrides,
  };
}

describe('buildLookupIndexOrFallback', () => {
  let logDebug: ReturnType<typeof vi.fn>;
  let logWarn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logDebug = vi.fn();
    logWarn = vi.fn();
  });

  it('does nothing when options.lookupIndex is already set', async () => {
    const options: Record<string, unknown> = { lookupIndex: new Map() };
    const dictionaryManager = makeDictionaryManager();

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(mockRustLookupIndexManager.isAvailable).not.toHaveBeenCalled();
  });

  it('does nothing when text is shorter than MIN_TEXT_FOR_RUST_INDEX', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager();

    await buildLookupIndexOrFallback(SHORT_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(mockRustLookupIndexManager.isAvailable).not.toHaveBeenCalled();
    expect(options.lookupIndex).toBeUndefined();
  });

  it('does nothing when useSharedLookupIndex is explicitly false', async () => {
    const options: Record<string, unknown> = { useSharedLookupIndex: false };
    const dictionaryManager = makeDictionaryManager();

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(mockRustLookupIndexManager.isAvailable).not.toHaveBeenCalled();
  });

  it('does nothing when the Rust manager is unavailable', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager();
    mockRustLookupIndexManager.isAvailable.mockReturnValue(false);

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(options.lookupIndex).toBeUndefined();
  });

  it('sets lookupIndex from a successful Rust build', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager();
    mockRustLookupIndexManager.isAvailable.mockReturnValue(true);
    mockRustLookupIndexManager.buildLookupIndex.mockResolvedValue({
      success: true,
      index: { 0: { characters: [{ word: '测', translation: 'test' }] } },
      buildTimeMs: 1,
      positionsIndexed: 60,
      indexSize: 1,
    });

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(options.lookupIndex).toBeInstanceOf(Map);
    expect((options.lookupIndex as Map<number, unknown>).get(0)).toEqual({
      characters: [{ word: '测', translation: 'test' }],
    });
    expect(options.useSharedLookupIndex).toBe(true);
    expect(logDebug).toHaveBeenCalledTimes(1);
  });

  it('passes real per-dictionary priority to the Rust build, not dictionaryOrder position', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager({
      getDefaultSearchOrder: vi.fn(() => ['properNouns-f_A', 'properNouns-f_B']),
      getPriorityForDictionary: vi.fn((name: string) =>
        name.startsWith('properNouns-f_') ? 1 : 10
      ),
    });
    mockRustLookupIndexManager.isAvailable.mockReturnValue(true);
    mockRustLookupIndexManager.buildLookupIndex.mockResolvedValue({
      success: true,
      index: {},
      buildTimeMs: 1,
      positionsIndexed: 0,
      indexSize: 0,
    });

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    const priorityByName = mockRustLookupIndexManager.buildLookupIndex.mock.calls[0][3];
    expect(priorityByName).toBeInstanceOf(Map);
    expect(priorityByName.get('properNouns-f_A')).toBe(1);
    expect(priorityByName.get('properNouns-f_B')).toBe(1);
  });

  it('leaves lookupIndex unset when the Rust build throws', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager();
    mockRustLookupIndexManager.isAvailable.mockReturnValue(true);
    mockRustLookupIndexManager.buildLookupIndex.mockRejectedValue(new Error('Rust panic'));

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(options.lookupIndex).toBeUndefined();
    expect(options.useSharedLookupIndex).toBeUndefined();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Rust panic'));
  });
});

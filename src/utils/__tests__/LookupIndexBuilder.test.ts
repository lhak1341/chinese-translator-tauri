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
    buildComprehensiveLookupIndex: vi.fn(),
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

  it('does nothing when the Rust manager is unavailable (no JS fallback attempted)', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager();
    mockRustLookupIndexManager.isAvailable.mockReturnValue(false);

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(dictionaryManager.buildComprehensiveLookupIndex).not.toHaveBeenCalled();
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
    expect(dictionaryManager.buildComprehensiveLookupIndex).not.toHaveBeenCalled();
  });

  it('falls back to the JS comprehensive index when the Rust build throws', async () => {
    const options: Record<string, unknown> = {};
    const jsIndex = new Map([[0, { characters: [] }]]);
    const dictionaryManager = makeDictionaryManager({
      buildComprehensiveLookupIndex: vi.fn().mockResolvedValue(jsIndex),
    });
    mockRustLookupIndexManager.isAvailable.mockReturnValue(true);
    mockRustLookupIndexManager.buildLookupIndex.mockRejectedValue(new Error('Rust panic'));

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Rust panic'));
    expect(dictionaryManager.buildComprehensiveLookupIndex).toHaveBeenCalledWith(LONG_TEXT, {
      enableLookupIndexing: true,
    });
    expect(options.lookupIndex).toBe(jsIndex);
    expect(options.useSharedLookupIndex).toBe(true);
    expect(logDebug).toHaveBeenCalledTimes(1);
  });

  it('leaves lookupIndex unset when both the Rust build and JS fallback fail', async () => {
    const options: Record<string, unknown> = {};
    const dictionaryManager = makeDictionaryManager({
      buildComprehensiveLookupIndex: vi.fn().mockRejectedValue(new Error('JS index failed too')),
    });
    mockRustLookupIndexManager.isAvailable.mockReturnValue(true);
    mockRustLookupIndexManager.buildLookupIndex.mockRejectedValue(new Error('Rust panic'));

    await buildLookupIndexOrFallback(LONG_TEXT, options, { dictionaryManager, logDebug, logWarn });

    expect(options.lookupIndex).toBeUndefined();
    expect(options.useSharedLookupIndex).toBeUndefined();
    expect(logWarn).toHaveBeenCalledTimes(2);
  });
});

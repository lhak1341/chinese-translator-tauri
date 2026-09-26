/**
 * Invariant tests for useDictionaryCRUD.
 *
 * Four load-bearing invariants:
 *
 *   I1 (history-on-success): addToHistory fires only when persistDictionaryMutation / commitMoveOp
 *      returns true. On failure (returns false), addToHistory must NOT be called.
 *
 *   I2 (snapshot-before-mutate): all operations read dictionariesRef.current into a local snapshot
 *      BEFORE calling persist. Concurrent Mode can update the ref between the dispatch and the
 *      persist callback; the hook must never read the ref inside the persist chain.
 *
 *   I3 (error-propagates-clean): on persist failure, the hook throws, addToHistory is not called,
 *      and invalidateEngine is not called.
 *
 *   I4 (single-toast-on-error): addEntry/updateEntry/deleteEntry/bulkDeleteEntries call toast at
 *      most once per failure — the catch block's isValidationError/isSaveError guard exists
 *      specifically to prevent a second toast on top of the one already shown before the throw.
 *      Does NOT apply to moveEntry/bulkMoveEntries — those have no internal catch/toast at all;
 *      MoveDialog.tsx owns error display for move ops via its own inline error banner (see
 *      dictionary/CLAUDE.md's CRUD Audit Checklist item 4). I4's move-op tests assert the inverse:
 *      zero toast calls on failure, protecting that split from a future toast being added here
 *      that would double up with MoveDialog's banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictionaryCRUD } from '../useDictionaryCRUD';
import toast from '../../utils/toast';
import { validatePersistEntry } from '../../utils/dictionary/PersistTimeValidator';
import type { DictionaryData, DictionaryEntryValue } from '../../types/DictionaryTypes';

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/dictionary/PersistTimeValidator', () => ({
  validatePersistEntry: vi.fn().mockReturnValue(null),
}));
vi.mock('../../utils/dictionary', async () => ({
  // Real classifier: pure, and the CRUD rules under test depend on it.
  ...(await vi.importActual<typeof import('../../utils/dictionary/DictionaryIdClassifier')>(
    '../../utils/dictionary/DictionaryIdClassifier'
  )),
  sanitizeDictionaryEntry: vi.fn().mockImplementation((s: string, t: string) => ({
    source: s,
    translation: t,
  })),
  sortDictionaryEntries: vi.fn().mockImplementation((dict: DictionaryData) => ({ ...dict })),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DICT_ID = 'phrases';
const CHARS_ID = 'characters';
const SOURCE = '你好';
const SOURCE_B = '再见';
const SOURCE_C = '谢谢';
const TRANSLATION = 'xin chào';

const phraseEntry: DictionaryEntryValue = {
  translation: TRANSLATION,
  allowAsPatternVariable: false,
  lowPriority: false,
};

function makeRef(data: Record<string, DictionaryData> = { [DICT_ID]: { [SOURCE]: phraseEntry } }) {
  return { current: data };
}

function makeHook(
  refData: Record<string, DictionaryData> = { [DICT_ID]: { [SOURCE]: phraseEntry } },
  overrides: {
    persist?: ReturnType<typeof vi.fn>;
    commitMove?: ReturnType<typeof vi.fn>;
    addToHistory?: ReturnType<typeof vi.fn>;
    invalidate?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const dictionariesRef = makeRef(refData);
  const persist = overrides.persist ?? vi.fn().mockResolvedValue(true);
  const commitMove = overrides.commitMove ?? vi.fn().mockResolvedValue(true);
  const addToHistory = overrides.addToHistory ?? vi.fn();
  const invalidate = overrides.invalidate ?? vi.fn().mockResolvedValue(undefined);

  const { result } = renderHook(() =>
    useDictionaryCRUD(dictionariesRef, persist, commitMove, addToHistory, invalidate)
  );

  return { result, dictionariesRef, persist, commitMove, addToHistory, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── addEntry ─────────────────────────────────────────────────────────────────

describe('addEntry — success path', () => {
  it('calls addToHistory after persist succeeds (I1)', async () => {
    const { result, addToHistory, persist } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await result.current.addEntry(DICT_ID, SOURCE, TRANSLATION);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(addToHistory).toHaveBeenCalledTimes(1);
    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ dictionaryId: DICT_ID, operation: 'add' })
    );
  });

  it('calls invalidateEngine after persist succeeds', async () => {
    const { result, invalidate } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await result.current.addEntry(DICT_ID, SOURCE, TRANSLATION);
    });
    expect(invalidate).toHaveBeenCalledWith(DICT_ID);
  });

  it('uses string value for characters dict (not complex-entry format)', async () => {
    const { result, persist } = makeHook({ [CHARS_ID]: {} });
    await act(async () => {
      await result.current.addEntry(CHARS_ID, SOURCE, TRANSLATION);
    });
    // sortedDictionary passed to persist should have a string value, not an object
    const [, , sortedDict] = persist.mock.calls[0];
    expect(typeof sortedDict[SOURCE]).toBe('string');
  });

  it('uses object value for phrases dict', async () => {
    const { result, persist } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await result.current.addEntry(DICT_ID, SOURCE, TRANSLATION);
    });
    const [, , sortedDict] = persist.mock.calls[0];
    expect(typeof sortedDict[SOURCE]).toBe('object');
    expect((sortedDict[SOURCE] as DictionaryEntryValue).translation).toBe(TRANSLATION);
  });
});

describe('addEntry — persist failure (I1 + I3)', () => {
  it('does NOT call addToHistory when persist returns false', async () => {
    const { result, addToHistory } = makeHook(
      { [DICT_ID]: {} },
      { persist: vi.fn().mockResolvedValue(false) }
    );
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT call invalidateEngine when persist returns false (I3)', async () => {
    const { result, invalidate } = makeHook(
      { [DICT_ID]: {} },
      { persist: vi.fn().mockResolvedValue(false) }
    );
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('throws when persist returns false', async () => {
    const { result } = makeHook({ [DICT_ID]: {} }, { persist: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow(
        'Failed to save dictionary changes'
      );
    });
  });
});

describe('addEntry — dictionary not found', () => {
  it('throws ValidationError when dict does not exist', async () => {
    const { result } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.addEntry('nonexistent', SOURCE, TRANSLATION)).rejects.toThrow(
        "Dictionary 'nonexistent' does not exist"
      );
    });
  });

  it('does NOT call persist when dict not found', async () => {
    const { result, persist } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.addEntry('nonexistent', SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(persist).not.toHaveBeenCalled();
  });
});

// ─── updateEntry ──────────────────────────────────────────────────────────────

describe('updateEntry — success path', () => {
  it('calls addToHistory with operation=update on success (I1)', async () => {
    const { result, addToHistory } = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION);
    });
    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'update', dictionaryId: DICT_ID })
    );
  });

  it('includes oldEntry in history when source key changes', async () => {
    const { result, addToHistory } = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.updateEntry(DICT_ID, SOURCE, SOURCE_B, TRANSLATION);
    });
    const call = addToHistory.mock.calls[0][0];
    expect(call.oldEntry).toEqual({ source: SOURCE, value: phraseEntry });
    expect(call.oldSource).toBe(SOURCE);
  });
});

describe('updateEntry — persist failure (I1 + I3)', () => {
  it('does NOT call addToHistory when persist returns false', async () => {
    const { result, addToHistory } = makeHook(
      { [DICT_ID]: { [SOURCE]: phraseEntry } },
      { persist: vi.fn().mockResolvedValue(false) }
    );
    await act(async () => {
      await expect(
        result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION)
      ).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });
});

// ─── deleteEntry ──────────────────────────────────────────────────────────────

describe('deleteEntry — success path', () => {
  it('calls addToHistory with operation=delete and oldEntry (I1)', async () => {
    const { result, addToHistory } = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.deleteEntry(DICT_ID, SOURCE);
    });
    expect(addToHistory).toHaveBeenCalledWith({
      dictionaryId: DICT_ID,
      operation: 'delete',
      oldEntry: { source: SOURCE, value: phraseEntry },
    });
  });
});

describe('deleteEntry — source not found', () => {
  it('throws ValidationError for missing source key', async () => {
    const { result } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow(
        `Entry '${SOURCE}' not found in dictionary`
      );
    });
  });

  it('does NOT call persist for missing source', async () => {
    const { result, persist } = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('deleteEntry — persist failure (I3)', () => {
  it('does NOT call addToHistory when persist returns false', async () => {
    const { result, addToHistory } = makeHook(
      { [DICT_ID]: { [SOURCE]: phraseEntry } },
      { persist: vi.fn().mockResolvedValue(false) }
    );
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });
});

// ─── bulkDeleteEntries ────────────────────────────────────────────────────────

describe('bulkDeleteEntries — empty input', () => {
  it('returns zero counts without calling persist', async () => {
    const { result, persist } = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    let res: { successCount: number; errors: string[] } | undefined;
    await act(async () => {
      res = await result.current.bulkDeleteEntries(DICT_ID, []);
    });
    expect(res).toEqual({ successCount: 0, errors: [] });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('bulkDeleteEntries — success path', () => {
  it('calls addToHistory with operation=bulk_delete for multiple entries (I1)', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry, [SOURCE_C]: phraseEntry },
    };
    const { result, addToHistory } = makeHook(refData);
    await act(async () => {
      await result.current.bulkDeleteEntries(DICT_ID, [SOURCE, SOURCE_B]);
    });
    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'bulk_delete', dictionaryId: DICT_ID })
    );
  });

  it('calls addToHistory with operation=delete (singular) for exactly one entry', async () => {
    const { result, addToHistory } = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.bulkDeleteEntries(DICT_ID, [SOURCE]);
    });
    expect(addToHistory).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete' }));
  });

  it('returns successCount and errors for partial match (I2 — snapshot integrity)', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry } };
    const { result } = makeHook(refData);
    let res: { successCount: number; errors: string[] } | undefined;
    await act(async () => {
      // SOURCE exists, SOURCE_B does not
      res = await result.current.bulkDeleteEntries(DICT_ID, [SOURCE, SOURCE_B]);
    });
    expect(res!.successCount).toBe(1);
    expect(res!.errors).toHaveLength(1);
    expect(res!.errors[0]).toContain(SOURCE_B);
  });

  it('passes original snapshot as oldData to persist (I2)', async () => {
    const originalDict = { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry };
    const { result, persist } = makeHook({ [DICT_ID]: { ...originalDict } });
    await act(async () => {
      await result.current.bulkDeleteEntries(DICT_ID, [SOURCE]);
    });
    // oldData (2nd arg to persist) must be the original snapshot
    const [, oldData] = persist.mock.calls[0];
    expect(oldData).toEqual(originalDict);
    // sortedDictionary (3rd arg) must have SOURCE removed
    const [, , sortedDict] = persist.mock.calls[0];
    expect(sortedDict[SOURCE]).toBeUndefined();
    expect(sortedDict[SOURCE_B]).toEqual(phraseEntry);
  });
});

describe('bulkDeleteEntries — persist failure (I3)', () => {
  it('does NOT call addToHistory when persist returns false', async () => {
    const { result, addToHistory } = makeHook(
      { [DICT_ID]: { [SOURCE]: phraseEntry } },
      { persist: vi.fn().mockResolvedValue(false) }
    );
    await act(async () => {
      await expect(result.current.bulkDeleteEntries(DICT_ID, [SOURCE])).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });
});

// ─── moveEntry ────────────────────────────────────────────────────────────────

const TARGET_ID = 'properNouns-Test';

describe('moveEntry — success path', () => {
  it('calls addToHistory with operation=move (I1)', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry },
      [TARGET_ID]: {},
    };
    const { result, addToHistory } = makeHook(refData);
    await act(async () => {
      await result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test');
    });
    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'move',
        dictionaryId: DICT_ID,
        targetDictionaryId: TARGET_ID,
      })
    );
  });

  it('invalidates both source and target dicts', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry },
      [TARGET_ID]: {},
    };
    const { result, invalidate } = makeHook(refData);
    await act(async () => {
      await result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test');
    });
    expect(invalidate).toHaveBeenCalledWith(DICT_ID);
    expect(invalidate).toHaveBeenCalledWith(TARGET_ID);
  });

  it('passes old snapshots as oldSource/oldTarget to commitMove (I2)', async () => {
    const sourceSnapshot = { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry };
    const targetSnapshot = { [SOURCE_C]: phraseEntry };
    const refData = {
      [DICT_ID]: { ...sourceSnapshot },
      [TARGET_ID]: { ...targetSnapshot },
    };
    const { result, commitMove } = makeHook(refData);
    await act(async () => {
      await result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test');
    });
    const [args] = commitMove.mock.calls;
    expect(args[0].oldSource).toEqual(sourceSnapshot);
    expect(args[0].oldTarget).toEqual(targetSnapshot);
    // newSource must have SOURCE removed
    expect(args[0].newSource[SOURCE]).toBeUndefined();
    // newTarget must have SOURCE added
    expect(args[0].newTarget[SOURCE]).toEqual(phraseEntry);
  });
});

describe('moveEntry — source not found', () => {
  it('throws ValidationError when entry missing from source dict', async () => {
    const refData = { [DICT_ID]: {}, [TARGET_ID]: {} };
    const { result } = makeHook(refData);
    await act(async () => {
      await expect(result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test')).rejects.toThrow(
        `Entry '${SOURCE}' not found in source dictionary`
      );
    });
  });
});

describe('moveEntry / bulkMoveEntries — incompatible target', () => {
  it.each([
    ['patterns', 'phrases'],
    ['phrases', 'characters'],
    ['characters', 'conversion'],
  ])('rejects a move from %s to %s before touching disk', async (from, to) => {
    const refData = { [from]: { [SOURCE]: phraseEntry }, [to]: {} };
    const { result, commitMove } = makeHook(refData);
    await act(async () => {
      await expect(result.current.moveEntry(from, to, SOURCE, 'Test')).rejects.toThrow(
        /incompatible dictionary types/
      );
      await expect(result.current.bulkMoveEntries(from, to, [SOURCE], 'Test')).rejects.toThrow(
        /incompatible dictionary types/
      );
    });
    expect(commitMove).not.toHaveBeenCalled();
  });
});

describe('moveEntry — commitMove failure (I1 + I3)', () => {
  it('does NOT call addToHistory when commitMove returns false', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result, addToHistory } = makeHook(refData, {
      commitMove: vi.fn().mockResolvedValue(false),
    });
    await act(async () => {
      await expect(result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test')).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });

  it('does NOT call invalidateEngine when commitMove returns false (I3)', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result, invalidate } = makeHook(refData, {
      commitMove: vi.fn().mockResolvedValue(false),
    });
    await act(async () => {
      await expect(result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test')).rejects.toThrow();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// ─── bulkMoveEntries ──────────────────────────────────────────────────────────

describe('bulkMoveEntries — empty input', () => {
  it('returns zero counts without calling commitMove', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result, commitMove } = makeHook(refData);
    let res: { movedCount: number; errors: string[] } | undefined;
    await act(async () => {
      res = await result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [], 'Test');
    });
    expect(res).toEqual({ movedCount: 0, errors: [] });
    expect(commitMove).not.toHaveBeenCalled();
  });
});

describe('bulkMoveEntries — success path', () => {
  it('calls addToHistory with operation=bulk_move for multiple entries (I1)', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry },
      [TARGET_ID]: {},
    };
    const { result, addToHistory } = makeHook(refData);
    await act(async () => {
      await result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [SOURCE, SOURCE_B], 'Test');
    });
    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'bulk_move',
        dictionaryId: DICT_ID,
        targetDictionaryId: TARGET_ID,
      })
    );
  });

  it('tracks partial success: missing entries become errors', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry },
      [TARGET_ID]: {},
    };
    const { result } = makeHook(refData);
    let res: { movedCount: number; errors: string[] } | undefined;
    await act(async () => {
      // SOURCE_B does not exist in source dict
      res = await result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [SOURCE, SOURCE_B], 'Test');
    });
    expect(res!.movedCount).toBe(1);
    expect(res!.errors).toHaveLength(1);
    expect(res!.errors[0]).toContain(SOURCE_B);
  });
});

describe('bulkMoveEntries — commitMove failure (I3)', () => {
  it('does NOT call addToHistory when commitMove returns false', async () => {
    const refData = {
      [DICT_ID]: { [SOURCE]: phraseEntry },
      [TARGET_ID]: {},
    };
    const { result, addToHistory } = makeHook(refData, {
      commitMove: vi.fn().mockResolvedValue(false),
    });
    await act(async () => {
      await expect(
        result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [SOURCE], 'Test')
      ).rejects.toThrow();
    });
    expect(addToHistory).not.toHaveBeenCalled();
  });
});

// ─── I4: single-toast-on-error ─────────────────────────────────────────────────

describe('addEntry — single toast per failure (I4)', () => {
  it('toasts once when the dictionary does not exist', async () => {
    const { result } = makeHook({});
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once on a validation error', async () => {
    const { result } = makeHook();
    vi.mocked(validatePersistEntry).mockReturnValueOnce('bad entry');
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE_B, TRANSLATION)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist returns false', async () => {
    const { result } = makeHook({ [DICT_ID]: {} }, { persist: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist throws unexpectedly', async () => {
    const { result } = makeHook(
      { [DICT_ID]: {} },
      { persist: vi.fn().mockRejectedValue(new Error('disk full')) }
    );
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('updateEntry — single toast per failure (I4)', () => {
  it('toasts once when the dictionary does not exist', async () => {
    const { result } = makeHook({});
    await act(async () => {
      await expect(
        result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION)
      ).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once on a validation error', async () => {
    const { result } = makeHook();
    vi.mocked(validatePersistEntry).mockReturnValueOnce('bad entry');
    await act(async () => {
      await expect(
        result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION)
      ).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist returns false', async () => {
    const { result } = makeHook(undefined, { persist: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(
        result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION)
      ).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist throws unexpectedly', async () => {
    const { result } = makeHook(undefined, {
      persist: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    await act(async () => {
      await expect(
        result.current.updateEntry(DICT_ID, SOURCE, SOURCE, TRANSLATION)
      ).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('deleteEntry — single toast per failure (I4)', () => {
  it('toasts once when the dictionary does not exist', async () => {
    const { result } = makeHook({});
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('warns once (not error) when the source entry is not found', async () => {
    const { result } = makeHook();
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE_B)).rejects.toThrow();
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts once when persist returns false', async () => {
    const { result } = makeHook(undefined, { persist: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist throws unexpectedly', async () => {
    const { result } = makeHook(undefined, {
      persist: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('bulkDeleteEntries — single toast per failure (I4)', () => {
  it('toasts once when the dictionary does not exist', async () => {
    const { result } = makeHook({});
    await act(async () => {
      await expect(result.current.bulkDeleteEntries(DICT_ID, [SOURCE])).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist returns false', async () => {
    const { result } = makeHook(undefined, { persist: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(result.current.bulkDeleteEntries(DICT_ID, [SOURCE])).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('toasts once when persist throws unexpectedly', async () => {
    const { result } = makeHook(undefined, {
      persist: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    await act(async () => {
      await expect(result.current.bulkDeleteEntries(DICT_ID, [SOURCE])).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('moveEntry — no internal toast on failure (I4)', () => {
  it('does not toast when the source entry is not found', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result } = makeHook(refData);
    await act(async () => {
      await expect(
        result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE_B, 'Test')
      ).rejects.toThrow();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not toast when commitMove returns false', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result } = makeHook(refData, { commitMove: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(result.current.moveEntry(DICT_ID, TARGET_ID, SOURCE, 'Test')).rejects.toThrow();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('bulkMoveEntries — no internal toast on failure (I4)', () => {
  it('does not toast when the source dictionary is missing', async () => {
    const { result } = makeHook({ [TARGET_ID]: {} });
    await act(async () => {
      await expect(
        result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [SOURCE], 'Test')
      ).rejects.toThrow();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not toast when commitMove returns false', async () => {
    const refData = { [DICT_ID]: { [SOURCE]: phraseEntry }, [TARGET_ID]: {} };
    const { result } = makeHook(refData, { commitMove: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      await expect(
        result.current.bulkMoveEntries(DICT_ID, TARGET_ID, [SOURCE], 'Test')
      ).rejects.toThrow();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

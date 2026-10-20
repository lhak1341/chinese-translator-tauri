/**
 * Wiring tests for useDictionaryCRUD: each method plans a Dictionary Edit, commits it through
 * the real commit protocol (`commitEdit`) over a fake disk, and turns the outcome into a
 * message or a typed throw. What an edit does to the dictionaries — and how undo reverses it —
 * is tested once, in DictionaryEdit.test.ts and EditCommitter.test.ts; the queue in front of
 * it, in DictionaryStore.test.ts.
 *
 * Invariants kept from the pre-commit-queue hook:
 *
 *   I1 (history-on-success): `record` fires only after every save succeeded.
 *   I3 (error-propagates-clean): on a failed save the method throws, nothing is recorded, and
 *      memory is back as it was.
 *   I4 (single-toast-on-error): add/update/patch/delete/bulkDelete toast at most once per
 *      failure. moveEntry/bulkMoveEntries toast never on failure — MoveDialog.tsx owns their
 *      error display (dictionary/CLAUDE.md's CRUD Audit Checklist item 4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictionaryCRUD } from '../useDictionaryCRUD';
import { commitEdit } from '../../components/dictionary/EditCommitter';
import type { EditCommitter } from '../../components/dictionary/EditCommitter';
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
  // Real entry-value helpers: patchEntry's merge is what is under test.
  ...(await vi.importActual<typeof import('../../utils/dictionary/EntryValue')>(
    '../../utils/dictionary/EntryValue'
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
const PN_A = 'properNouns-A';
const PN_B = 'properNouns-B';
const SOURCE = '你好';
const SOURCE_B = '再见';
const TRANSLATION = 'xin chào';

const phraseEntry: DictionaryEntryValue = {
  translation: TRANSLATION,
  allowAsPatternVariable: false,
};

let memory: Record<string, DictionaryData>;
let save: ReturnType<typeof vi.fn>;
let record: ReturnType<typeof vi.fn>;

function makeHook(initial: Record<string, DictionaryData>) {
  memory = structuredClone(initial);
  save = vi.fn().mockResolvedValue({ success: true });
  record = vi.fn();
  const deps = {
    read: () => memory,
    write: (updates: Record<string, DictionaryData>) => {
      memory = { ...memory, ...updates };
    },
    save,
  };
  // No queue: each test awaits one call at a time.
  const committer: EditCommitter = {
    commit: (plan, onCommitted) => commitEdit(deps, plan, onCommitted),
  };
  const { result } = renderHook(() => useDictionaryCRUD(committer, record));
  return result;
}

const failSaves = () => save.mockResolvedValue({ success: false });
const throwSaves = () => save.mockRejectedValue(new Error('IPC down'));
const toastCount = () =>
  vi.mocked(toast.error).mock.calls.length + vi.mocked(toast.warning).mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── addEntry ─────────────────────────────────────────────────────────────────

describe('addEntry', () => {
  it('commits, saves and records on success (I1)', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await result.current.addEntry(DICT_ID, SOURCE, TRANSLATION);
    });
    expect(memory[DICT_ID][SOURCE]).toEqual(phraseEntry);
    expect(record).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(DICT_ID, memory[DICT_ID]);
    expect(toast.success).toHaveBeenCalledWith('Entry added successfully');
  });

  it('warns when it overwrote an existing entry', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.addEntry(DICT_ID, SOURCE, 'mới');
    });
    expect(toast.warning).toHaveBeenCalledWith('Existing entry overwritten');
  });

  it('uses a string value for a lookup table and an object for phrases', async () => {
    const result = makeHook({ [DICT_ID]: {}, [CHARS_ID]: {} });
    await act(async () => {
      await result.current.addEntry(CHARS_ID, '我', 'ta');
      await result.current.addEntry(DICT_ID, SOURCE, TRANSLATION, { semanticType: 'concept' });
    });
    expect(memory[CHARS_ID]['我']).toBe('ta');
    expect(memory[DICT_ID][SOURCE]).toEqual({ ...phraseEntry, semanticType: 'concept' });
  });

  it('throws, records nothing and restores memory when the save fails (I3)', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    failSaves();
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow(
        'Failed to save dictionary changes'
      );
    });
    expect(record).not.toHaveBeenCalled();
    expect(memory[DICT_ID]).toEqual({});
  });

  it.each([
    ['the dictionary does not exist', () => makeHook({})],
    [
      'validation fails',
      () => {
        vi.mocked(validatePersistEntry).mockReturnValueOnce('bad entry');
        return makeHook({ [DICT_ID]: {} });
      },
    ],
    [
      'the save fails',
      () => {
        const r = makeHook({ [DICT_ID]: {} });
        failSaves();
        return r;
      },
    ],
    [
      'the save throws',
      () => {
        const r = makeHook({ [DICT_ID]: {} });
        throwSaves();
        return r;
      },
    ],
  ])('toasts once when %s (I4)', async (_name, setup) => {
    const result = setup();
    await act(async () => {
      await expect(result.current.addEntry(DICT_ID, SOURCE, TRANSLATION)).rejects.toThrow();
    });
    expect(toastCount()).toBe(1);
  });
});

// ─── updateEntry ─────────────────────────────────────────────────────────────

describe('updateEntry', () => {
  it('renames the key and records the edit (I1)', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.updateEntry(DICT_ID, SOURCE, SOURCE_B, 'tạm biệt');
    });
    expect(memory[DICT_ID]).toEqual({
      [SOURCE_B]: { translation: 'tạm biệt', allowAsPatternVariable: false },
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the dictionary does not exist', () => makeHook({})],
    [
      'the save fails',
      () => {
        const r = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
        failSaves();
        return r;
      },
    ],
  ])('toasts once and records nothing when %s (I3 + I4)', async (_name, setup) => {
    const result = setup();
    await act(async () => {
      await expect(result.current.updateEntry(DICT_ID, SOURCE, SOURCE, 'x')).rejects.toThrow();
    });
    expect(toastCount()).toBe(1);
    expect(record).not.toHaveBeenCalled();
  });
});

// ─── patchEntry ──────────────────────────────────────────────────────────────

describe('patchEntry', () => {
  const PROPER_ID = 'properNouns';
  const stored: DictionaryEntryValue = {
    translation: 'Nam Kinh',
    allowAsPatternVariable: true,
    semanticType: 'location',
    allowedVariableTypes: { X: ['character'] },
  };

  it('changes the patched field and keeps every other field as stored', async () => {
    const result = makeHook({ [PROPER_ID]: { [SOURCE]: stored } });
    await act(async () => {
      await result.current.patchEntry(PROPER_ID, SOURCE, { semanticType: 'organization' });
    });
    expect(memory[PROPER_ID][SOURCE]).toEqual({ ...stored, semanticType: 'organization' });
    expect(record).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(PROPER_ID, memory[PROPER_ID]);
  });

  it('reads the current value, not a caller snapshot, when given an updater', async () => {
    const result = makeHook({ [PROPER_ID]: { [SOURCE]: stored } });
    await act(async () => {
      await result.current.patchEntry(PROPER_ID, SOURCE, (current) => ({
        allowedVariableTypes: { ...current.allowedVariableTypes, Y: ['location'] },
      }));
    });
    expect((memory[PROPER_ID][SOURCE] as DictionaryEntryValue).allowedVariableTypes).toEqual({
      X: ['character'],
      Y: ['location'],
    });
  });

  it('two queued patches each start from the other one’s result', async () => {
    const result = makeHook({ [PROPER_ID]: { [SOURCE]: stored } });
    await act(async () => {
      await Promise.all([
        result.current.patchEntry(PROPER_ID, SOURCE, { semanticType: 'organization' }),
        result.current.patchEntry(PROPER_ID, SOURCE, { translation: 'Nam Kinh 2' }),
      ]);
    });
    expect(memory[PROPER_ID][SOURCE]).toEqual({
      ...stored,
      semanticType: 'organization',
      translation: 'Nam Kinh 2',
    });
  });

  it('an emptied field removes its key', async () => {
    const result = makeHook({ [PROPER_ID]: { [SOURCE]: stored } });
    await act(async () => {
      await result.current.patchEntry(PROPER_ID, SOURCE, {
        semanticType: '',
        allowedVariableTypes: {},
      });
    });
    expect(memory[PROPER_ID][SOURCE]).toEqual({
      translation: 'Nam Kinh',
      allowAsPatternVariable: true,
    });
  });

  it('writes a legacy string value back as an object', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: 'xin chào' } });
    await act(async () => {
      await result.current.patchEntry(DICT_ID, SOURCE, { semanticType: 'concept' });
    });
    expect(memory[DICT_ID][SOURCE]).toEqual({
      translation: 'xin chào',
      allowAsPatternVariable: false,
      semanticType: 'concept',
    });
  });

  it('keeps only the translation for a lookup table', async () => {
    const result = makeHook({ [CHARS_ID]: { [SOURCE]: 'tốt' } });
    await act(async () => {
      await result.current.patchEntry(CHARS_ID, SOURCE, {
        translation: 'hay',
        semanticType: 'concept',
      });
    });
    expect(memory[CHARS_ID][SOURCE]).toBe('hay');
  });

  it('throws ValidationError and writes nothing for an entry that does not exist', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(
        result.current.patchEntry(DICT_ID, SOURCE, { translation: 'x' })
      ).rejects.toThrow(`Entry '${SOURCE}' does not exist in '${DICT_ID}'`);
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('toasts once when the patched value fails validation', async () => {
    const result = makeHook({ [PROPER_ID]: { [SOURCE]: stored } });
    vi.mocked(validatePersistEntry).mockReturnValueOnce('bad entry');
    await act(async () => {
      await expect(
        result.current.patchEntry(PROPER_ID, SOURCE, { translation: '' })
      ).rejects.toThrow('bad entry');
    });
    expect(toastCount()).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });
});

// ─── deleteEntry / bulkDeleteEntries ─────────────────────────────────────────

// ─── renameEntry ─────────────────────────────────────────────────────────────

describe('renameEntry', () => {
  it('re-keys the entry, keeping every field as stored', async () => {
    const result = makeHook({
      [DICT_ID]: {
        [SOURCE]: { ...phraseEntry, allowAsPatternVariable: true, semanticType: 'concept' },
      },
    });
    await act(async () => {
      await result.current.renameEntry(DICT_ID, SOURCE, SOURCE_B);
    });
    expect(memory[DICT_ID][SOURCE]).toBeUndefined();
    expect(memory[DICT_ID][SOURCE_B]).toEqual({
      translation: TRANSLATION,
      allowAsPatternVariable: true,
      semanticType: 'concept',
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('reads the value inside its commit, so a patch queued just before it is kept', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    // Both issued in one turn, as a VAR click then a rename can be before the row re-renders:
    // the rename must not carry the VAR it saw at render back over the patch.
    await act(async () => {
      await Promise.all([
        result.current.patchEntry(DICT_ID, SOURCE, { allowAsPatternVariable: true }),
        result.current.renameEntry(DICT_ID, SOURCE, SOURCE_B),
      ]);
    });
    expect(memory[DICT_ID][SOURCE]).toBeUndefined();
    expect(memory[DICT_ID][SOURCE_B]).toMatchObject({ allowAsPatternVariable: true });
  });

  it('refuses an entry that is not there, with one toast', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.renameEntry(DICT_ID, SOURCE, SOURCE_B)).rejects.toThrow();
    });
    expect(save).not.toHaveBeenCalled();
    expect(toastCount()).toBe(1);
  });
});

describe('deleteEntry', () => {
  it('deletes and records (I1)', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
    await act(async () => {
      await result.current.deleteEntry(DICT_ID, SOURCE);
    });
    expect(memory[DICT_ID]).toEqual({});
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('warns once (not error) and saves nothing when the entry is not found', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow(
        `Entry '${SOURCE}' not found in dictionary`
      );
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['the dictionary does not exist', () => makeHook({})],
    [
      'the save fails',
      () => {
        const r = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
        failSaves();
        return r;
      },
    ],
    [
      'the save throws',
      () => {
        const r = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
        throwSaves();
        return r;
      },
    ],
  ])('toasts once and records nothing when %s (I3 + I4)', async (_name, setup) => {
    const result = setup();
    await act(async () => {
      await expect(result.current.deleteEntry(DICT_ID, SOURCE)).rejects.toThrow();
    });
    expect(toastCount()).toBe(1);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('bulkDeleteEntries', () => {
  it('returns zero counts without saving for empty input', async () => {
    const result = makeHook({ [DICT_ID]: {} });
    let out;
    await act(async () => {
      out = await result.current.bulkDeleteEntries(DICT_ID, []);
    });
    expect(out).toEqual({ successCount: 0, errors: [] });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports missing entries as errors and records one edit', async () => {
    const result = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry } });
    let out;
    await act(async () => {
      out = await result.current.bulkDeleteEntries(DICT_ID, [SOURCE, SOURCE_B, '无']);
    });
    expect(out).toEqual({ successCount: 2, errors: ['Entry "无" not found in dictionary'] });
    expect(memory[DICT_ID]).toEqual({});
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the dictionary does not exist', () => makeHook({})],
    [
      'the save fails',
      () => {
        const r = makeHook({ [DICT_ID]: { [SOURCE]: phraseEntry } });
        failSaves();
        return r;
      },
    ],
  ])('toasts once and records nothing when %s (I3 + I4)', async (_name, setup) => {
    const result = setup();
    await act(async () => {
      await expect(result.current.bulkDeleteEntries(DICT_ID, [SOURCE])).rejects.toThrow();
    });
    expect(toastCount()).toBe(1);
    expect(record).not.toHaveBeenCalled();
  });
});

// ─── moveEntry / bulkMoveEntries ─────────────────────────────────────────────

describe('moveEntry', () => {
  it('moves, saves both dictionaries and records one edit (I1)', async () => {
    const result = makeHook({ [PN_A]: { [SOURCE]: phraseEntry }, [PN_B]: {} });
    await act(async () => {
      await result.current.moveEntry(PN_A, PN_B, SOURCE, 'B');
    });
    expect(memory[PN_A]).toEqual({});
    expect(memory[PN_B]).toEqual({ [SOURCE]: phraseEntry });
    expect(record).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.map(([id]) => id)).toEqual([PN_A, PN_B]);
  });

  it.each([
    [
      'the entry is not in the source',
      () => makeHook({ [PN_A]: {}, [PN_B]: {} }),
      `Entry '${SOURCE}' not found in source dictionary`,
    ],
    [
      'the target is an incompatible kind',
      () => makeHook({ [PN_A]: { [SOURCE]: phraseEntry }, [CHARS_ID]: {} }),
      'incompatible dictionary types',
    ],
    [
      'the save fails',
      () => {
        const r = makeHook({ [PN_A]: { [SOURCE]: phraseEntry }, [PN_B]: {} });
        failSaves();
        return r;
      },
      'Failed to save dictionaries during move',
    ],
  ])('throws without toasting when %s (I4)', async (name, setup, message) => {
    const result = setup();
    const target = name.includes('incompatible') ? CHARS_ID : PN_B;
    await act(async () => {
      await expect(result.current.moveEntry(PN_A, target, SOURCE, 'B')).rejects.toThrow(message);
    });
    expect(toastCount()).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('bulkMoveEntries', () => {
  it('returns zero counts without saving for empty input', async () => {
    const result = makeHook({ [PN_A]: {}, [PN_B]: {} });
    let out;
    await act(async () => {
      out = await result.current.bulkMoveEntries(PN_A, PN_B, [], 'B');
    });
    expect(out).toEqual({ movedCount: 0, errors: [] });
    expect(save).not.toHaveBeenCalled();
  });

  it('moves what exists and reports the rest', async () => {
    const result = makeHook({
      [PN_A]: { [SOURCE]: phraseEntry, [SOURCE_B]: phraseEntry },
      [PN_B]: {},
    });
    let out;
    await act(async () => {
      out = await result.current.bulkMoveEntries(PN_A, PN_B, [SOURCE, SOURCE_B, '无'], 'B');
    });
    expect(out).toEqual({ movedCount: 2, errors: ['Entry "无" not found'] });
    expect(Object.keys(memory[PN_B]).sort()).toEqual([SOURCE, SOURCE_B].sort());
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the source dictionary is missing', () => makeHook({ [PN_B]: {} })],
    [
      'the save fails',
      () => {
        const r = makeHook({ [PN_A]: { [SOURCE]: phraseEntry }, [PN_B]: {} });
        failSaves();
        return r;
      },
    ],
  ])('throws without toasting when %s (I4)', async (_name, setup) => {
    const result = setup();
    await act(async () => {
      await expect(result.current.bulkMoveEntries(PN_A, PN_B, [SOURCE], 'B')).rejects.toThrow();
    });
    expect(toastCount()).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });
});

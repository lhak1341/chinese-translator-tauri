import { describe, it, expect } from 'vitest';
import {
  computeUndoMutation,
  computeRedoMutation,
} from '../dictionary/DictionaryOperationReverter';
import type { HistoryOperation } from '../../types/DictionaryTypes';

// Helpers — build typed-value entries as 'phrases' dict uses
const entry = (source: string, translation: string) => ({
  source,
  value: { translation },
});

const op = (overrides: Omit<HistoryOperation, 'timestamp'>): HistoryOperation => ({
  timestamp: 0,
  ...overrides,
});

const DICTS = {
  phrases: { 你好: { translation: 'xin chào' }, 再见: { translation: 'tạm biệt' } },
  characters: { 你: '人', 再: '再' },
} as Record<string, Record<string, unknown>>;

// ──────────────────────────────────────────────
// computeUndoMutation
// ──────────────────────────────────────────────

describe('computeUndoMutation', () => {
  it('add → removes the added entry', () => {
    const result = computeUndoMutation(
      op({ dictionaryId: 'phrases', operation: 'add', entry: entry('你好', 'xin chào') }),
      DICTS
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).not.toHaveProperty('你好');
    expect(result![0].entries).toHaveProperty('再见');
  });

  it('delete → restores the deleted entry', () => {
    const dicts = { phrases: { 再见: { translation: 'tạm biệt' } } };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'delete',
        oldEntry: entry('你好', 'xin chào'),
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).toHaveProperty('你好');
  });

  it('update (same key) → restores old value', () => {
    const dicts = { phrases: { 你好: { translation: 'hello (updated)' } } };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'update',
        entry: entry('你好', 'hello (updated)'),
        oldEntry: entry('你好', 'xin chào'),
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect((result![0].entries['你好'] as { translation: string }).translation).toBe('xin chào');
  });

  it('update (renamed key) → removes new key, restores old key', () => {
    const dicts = { phrases: { 您好: { translation: 'xin chào' } } };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'update',
        oldSource: '你好',
        entry: entry('您好', 'xin chào'),
        oldEntry: entry('你好', 'xin chào'),
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).not.toHaveProperty('您好');
    expect(result![0].entries).toHaveProperty('你好');
  });

  it('bulk_delete → restores all deleted entries', () => {
    const dicts = { phrases: {} };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'bulk_delete',
        oldEntries: [entry('你好', 'xin chào'), entry('再见', 'tạm biệt')],
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).toHaveProperty('你好');
    expect(result![0].entries).toHaveProperty('再见');
  });

  it('move → pulls entry back from target to source', () => {
    const dicts = {
      phrases: { 再见: { translation: 'tạm biệt' } },
      characters: { 你好: { translation: 'xin chào' } },
    };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'move',
        targetDictionaryId: 'characters',
        oldEntry: entry('你好', 'xin chào'),
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const sourceUpdate = result!.find((u) => u.dictionaryId === 'phrases')!;
    const targetUpdate = result!.find((u) => u.dictionaryId === 'characters')!;
    expect(sourceUpdate.entries).toHaveProperty('你好');
    expect(targetUpdate.entries).not.toHaveProperty('你好');
  });

  it('bulk_move → pulls all entries back from target to source', () => {
    const dicts = {
      phrases: {},
      characters: { 你好: { translation: 'xin chào' }, 再见: { translation: 'tạm biệt' } },
    };
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'bulk_move',
        targetDictionaryId: 'characters',
        oldEntries: [entry('你好', 'xin chào'), entry('再见', 'tạm biệt')],
      }),
      dicts
    );
    expect(result).not.toBeNull();
    const sourceUpdate = result!.find((u) => u.dictionaryId === 'phrases')!;
    expect(sourceUpdate.entries).toHaveProperty('你好');
    expect(sourceUpdate.entries).toHaveProperty('再见');
  });

  it('returns null when dict is missing', () => {
    const result = computeUndoMutation(
      op({ dictionaryId: 'nonexistent', operation: 'add', entry: entry('x', 'y') }),
      DICTS
    );
    expect(result).toBeNull();
  });

  it('returns null when move target dict is missing', () => {
    const result = computeUndoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'move',
        targetDictionaryId: 'nonexistent',
        oldEntry: entry('你好', 'xin chào'),
      }),
      DICTS
    );
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────
// computeRedoMutation
// ──────────────────────────────────────────────

describe('computeRedoMutation', () => {
  it('add → re-adds the entry', () => {
    const dicts = { phrases: { 再见: { translation: 'tạm biệt' } } };
    const result = computeRedoMutation(
      op({ dictionaryId: 'phrases', operation: 'add', entry: entry('你好', 'xin chào') }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).toHaveProperty('你好');
  });

  it('delete → removes the entry again', () => {
    const result = computeRedoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'delete',
        oldEntry: entry('你好', 'xin chào'),
      }),
      DICTS
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).not.toHaveProperty('你好');
  });

  it('update (renamed key) → removes old key, applies new key+value', () => {
    const dicts = { phrases: { 你好: { translation: 'xin chào' } } };
    const result = computeRedoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'update',
        oldSource: '你好',
        entry: entry('您好', 'xin chào'),
        oldEntry: entry('你好', 'xin chào'),
      }),
      dicts
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).not.toHaveProperty('你好');
    expect(result![0].entries).toHaveProperty('您好');
  });

  it('bulk_delete → removes all entries again', () => {
    const result = computeRedoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'bulk_delete',
        oldEntries: [entry('你好', 'xin chào'), entry('再见', 'tạm biệt')],
      }),
      DICTS
    );
    expect(result).not.toBeNull();
    expect(result![0].entries).not.toHaveProperty('你好');
    expect(result![0].entries).not.toHaveProperty('再见');
  });

  it('move → pushes entry forward from source to target', () => {
    const result = computeRedoMutation(
      op({
        dictionaryId: 'phrases',
        operation: 'move',
        targetDictionaryId: 'characters',
        oldEntry: entry('你好', 'xin chào'),
      }),
      DICTS
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const sourceUpdate = result!.find((u) => u.dictionaryId === 'phrases')!;
    const targetUpdate = result!.find((u) => u.dictionaryId === 'characters')!;
    expect(sourceUpdate.entries).not.toHaveProperty('你好');
    expect(targetUpdate.entries).toHaveProperty('你好');
  });

  it('returns null when dict is missing', () => {
    const result = computeRedoMutation(
      op({ dictionaryId: 'nonexistent', operation: 'delete', oldEntry: entry('x', 'y') }),
      DICTS
    );
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────
// Symmetry: undo then redo is a no-op
// ──────────────────────────────────────────────

describe('undo/redo symmetry', () => {
  it('undo add → redo add restores original state', () => {
    const addOp = op({
      dictionaryId: 'phrases',
      operation: 'add',
      entry: entry('你好', 'xin chào'),
    });

    const afterUndo = computeUndoMutation(addOp, DICTS)!;
    const stateAfterUndo = { phrases: afterUndo[0].entries };

    const afterRedo = computeRedoMutation(addOp, stateAfterUndo)!;
    expect(afterRedo[0].entries).toHaveProperty('你好');
    expect(afterRedo[0].entries).toHaveProperty('再见');
  });
});

import { sortDictionaryEntries } from './index';
import type { DictionaryData, HistoryOperation } from '../../types/DictionaryTypes';

export type MutationUpdate = { dictionaryId: string; entries: DictionaryData };

/**
 * Computes the dict state(s) that result from undoing a history operation.
 * Returns null if a required dictionary is missing from currentDicts (caller logs + returns false).
 * Returned entries are already sorted — pass directly to commitMutation.
 */
export function computeUndoMutation(
  op: HistoryOperation,
  currentDicts: Record<string, DictionaryData>
): MutationUpdate[] | null {
  if ((op.operation === 'move' || op.operation === 'bulk_move') && op.targetDictionaryId) {
    const sourceDict = currentDicts[op.dictionaryId];
    const targetDict = currentDicts[op.targetDictionaryId];
    if (!sourceDict || !targetDict) return null;

    const newSourceDict = { ...sourceDict };
    const newTargetDict = { ...targetDict };
    const entries =
      op.operation === 'move' ? (op.oldEntry ? [op.oldEntry] : []) : (op.oldEntries ?? []);

    // Undo move: pull entries back from target to source
    for (const e of entries) {
      delete newTargetDict[e.source];
      newSourceDict[e.source] = e.value;
    }

    return [
      {
        dictionaryId: op.dictionaryId,
        entries: sortDictionaryEntries(newSourceDict, op.dictionaryId),
      },
      {
        dictionaryId: op.targetDictionaryId,
        entries: sortDictionaryEntries(newTargetDict, op.targetDictionaryId),
      },
    ];
  }

  const currentDict = currentDicts[op.dictionaryId];
  if (!currentDict) return null;

  const newDict = { ...currentDict };

  if (op.operation === 'add') {
    if (op.entry) delete newDict[op.entry.source];
  } else if (op.operation === 'update') {
    if (op.oldEntry) {
      // If the source key was renamed, remove the new key first
      if (op.oldSource && op.oldSource !== op.entry?.source) {
        delete newDict[op.entry!.source];
      }
      newDict[op.oldEntry.source] = op.oldEntry.value;
    }
  } else if (op.operation === 'delete') {
    if (op.oldEntry) newDict[op.oldEntry.source] = op.oldEntry.value;
  } else if (op.operation === 'bulk_delete') {
    for (const oldEntry of op.oldEntries ?? []) {
      newDict[oldEntry.source] = oldEntry.value;
    }
  }

  return [
    { dictionaryId: op.dictionaryId, entries: sortDictionaryEntries(newDict, op.dictionaryId) },
  ];
}

/**
 * Computes the dict state(s) that result from redoing a history operation.
 * Returns null if a required dictionary is missing from currentDicts (caller logs + returns false).
 * Returned entries are already sorted — pass directly to commitMutation.
 */
export function computeRedoMutation(
  op: HistoryOperation,
  currentDicts: Record<string, DictionaryData>
): MutationUpdate[] | null {
  if ((op.operation === 'move' || op.operation === 'bulk_move') && op.targetDictionaryId) {
    const sourceDict = currentDicts[op.dictionaryId];
    const targetDict = currentDicts[op.targetDictionaryId];
    if (!sourceDict || !targetDict) return null;

    const newSourceDict = { ...sourceDict };
    const newTargetDict = { ...targetDict };
    const entries =
      op.operation === 'move' ? (op.oldEntry ? [op.oldEntry] : []) : (op.oldEntries ?? []);

    // Redo move: push entries forward from source to target
    for (const e of entries) {
      delete newSourceDict[e.source];
      newTargetDict[e.source] = e.value;
    }

    return [
      {
        dictionaryId: op.dictionaryId,
        entries: sortDictionaryEntries(newSourceDict, op.dictionaryId),
      },
      {
        dictionaryId: op.targetDictionaryId,
        entries: sortDictionaryEntries(newTargetDict, op.targetDictionaryId),
      },
    ];
  }

  const currentDict = currentDicts[op.dictionaryId];
  if (!currentDict) return null;

  const newDict = { ...currentDict };

  if (op.operation === 'add') {
    if (op.entry) newDict[op.entry.source] = op.entry.value;
  } else if (op.operation === 'update') {
    if (op.entry) {
      // If the source key was renamed, remove the old key first
      if (op.oldSource && op.oldSource !== op.entry.source) {
        delete newDict[op.oldSource];
      }
      newDict[op.entry.source] = op.entry.value;
    }
  } else if (op.operation === 'delete') {
    if (op.oldEntry) delete newDict[op.oldEntry.source];
  } else if (op.operation === 'bulk_delete') {
    for (const oldEntry of op.oldEntries ?? []) {
      delete newDict[oldEntry.source];
    }
  }

  return [
    { dictionaryId: op.dictionaryId, entries: sortDictionaryEntries(newDict, op.dictionaryId) },
  ];
}

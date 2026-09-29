import { useState, useRef, useCallback } from 'react';
import toast from '../../utils/toast';
import { invert } from '../../utils/dictionary/DictionaryEdit';
import type { DictionaryEdit } from '../../utils/dictionary/DictionaryEdit';
import type { EditCommitter, CommitResult } from './EditCommitter';

const MAX_HISTORY = 100;

export interface DictionaryHistoryAPI {
  /** Records a committed edit; a new edit drops anything that could still be redone. */
  record: (edit: DictionaryEdit) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  /** Forgets every edit — after something outside history rewrote or renamed dictionaries. */
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function reportFailure(action: 'undo' | 'redo', result: CommitResult): void {
  if (result.status === 'refused') {
    toast.warning(
      `Can't ${action}: ${result.changedKeys.join(', ')} changed since — edit it directly instead`
    );
  } else if (result.status === 'saveFailed') {
    toast.error(
      result.rolledBack
        ? `Failed to save the ${action}`
        : `Failed to save the ${action} and could not fully revert it — reload dictionaries before editing further`
    );
  }
}

/**
 * Dictionary undo/redo: a list of committed Dictionary Edits and a cursor. Undo commits the
 * inverse of the edit at the cursor, redo the edit after it — both through the same
 * `EditCommitter` queue as every other edit, which refuses one whose keys changed since.
 *
 * The list and cursor live in a ref, not state, so the edit an undo picks and the cursor move
 * after it both happen inside its turn in the queue — a queued edit never records itself
 * between them. `version` only makes `canUndo`/`canRedo` re-render.
 */
export function useDictionaryHistory(committer: EditCommitter): DictionaryHistoryAPI {
  const historyRef = useRef<{ edits: DictionaryEdit[]; cursor: number }>({
    edits: [],
    cursor: -1,
  });
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const record = useCallback(
    (edit: DictionaryEdit): void => {
      const h = historyRef.current;
      const edits = h.edits.slice(0, h.cursor + 1);
      edits.push(edit);
      if (edits.length > MAX_HISTORY) edits.shift();
      historyRef.current = { edits, cursor: edits.length - 1 };
      bump();
    },
    [bump]
  );

  const clear = useCallback((): void => {
    historyRef.current = { edits: [], cursor: -1 };
    bump();
  }, [bump]);

  const undo = useCallback(async (): Promise<boolean> => {
    const result = await committer.commit(
      () => {
        const { edits, cursor } = historyRef.current;
        return cursor >= 0 ? invert(edits[cursor]) : { invalid: 'Nothing to undo' };
      },
      () => {
        historyRef.current = { ...historyRef.current, cursor: historyRef.current.cursor - 1 };
        bump();
      }
    );
    reportFailure('undo', result);
    return result.status === 'ok';
  }, [committer, bump]);

  const redo = useCallback(async (): Promise<boolean> => {
    const result = await committer.commit(
      () => {
        const { edits, cursor } = historyRef.current;
        return cursor < edits.length - 1 ? edits[cursor + 1] : { invalid: 'Nothing to redo' };
      },
      () => {
        historyRef.current = { ...historyRef.current, cursor: historyRef.current.cursor + 1 };
        bump();
      }
    );
    reportFailure('redo', result);
    return result.status === 'ok';
  }, [committer, bump]);

  const { edits, cursor } = historyRef.current;
  return {
    record,
    undo,
    redo,
    clear,
    canUndo: cursor >= 0,
    canRedo: cursor < edits.length - 1,
  };
}

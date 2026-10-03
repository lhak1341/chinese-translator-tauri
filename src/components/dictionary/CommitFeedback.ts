import { isSaveError, isValidationError } from '../../utils/errors';
import { extractErrorMessage } from '../../utils/errorHelpers';
import type { CommitResult } from './EditCommitter';

/**
 * What the user is told when a Dictionary Edit does not land — the one place the wording
 * lives. Pure: each function turns an outcome or a thrown error into a `Feedback` (or `null`
 * for "say nothing"), and the caller toasts it, so every message is testable on plain values.
 *
 * Two kinds of caller, because a failure means different things to them:
 * - **A fresh plan** (`useDictionaryCRUD`) planned the edit a moment ago against the same
 *   dictionaries it commits to, so a `refused` outcome is a bug, not a normal event.
 * - **A replayed one** (`useDictionaryHistory`) is an old edit, which a later edit may have
 *   made stale — `refused` is expected and tells the user to edit the entry directly.
 */

export interface Feedback {
  level: 'error' | 'warning';
  message: string;
}

type CommitFailure = Extract<CommitResult, { status: 'refused' | 'saveFailed' }>;

/** The advice for a save that failed with its write-back, so disk may hold half an edit. One
 * sentence, shared, so the two callers cannot drift apart again. */
const HALF_APPLIED_ADVICE =
  'it could not be fully reverted — reload dictionaries before editing further';

function withHalfApplied(message: string): string {
  return `${message}, and ${HALF_APPLIED_ADVICE}`;
}

/**
 * A fresh plan's commit failed. `toast` is what the user sees; `errorMessage` is what the
 * thrown `SaveError` carries (a `refused` one names the keys, which the toast leaves out).
 */
export function describeFreshFailure(
  result: CommitFailure,
  failMessage: string
): { toast: Feedback; errorMessage: string } {
  if (result.status === 'refused') {
    return {
      toast: { level: 'error', message: failMessage },
      errorMessage: `${failMessage}: ${result.changedKeys.join(', ')} changed`,
    };
  }
  const message = result.rolledBack ? failMessage : withHalfApplied(failMessage);
  return { toast: { level: 'error', message }, errorMessage: message };
}

/**
 * A replayed edit (undo or redo) did not land. An `invalid` plan — "Nothing to undo" — says
 * nothing on purpose: the palette and buttons already gate on `canUndo`/`canRedo`, so a stray
 * Cmd+Z on an empty history is not worth a toast.
 */
export function describeReplayFailure(
  action: 'undo' | 'redo',
  result: CommitResult
): Feedback | null {
  if (result.status === 'refused') {
    return {
      level: 'warning',
      message: `Can't ${action}: ${result.changedKeys.join(', ')} changed since — edit it directly instead`,
    };
  }
  if (result.status === 'saveFailed') {
    const message = `Failed to save the ${action}`;
    return {
      level: 'error',
      message: result.rolledBack ? message : withHalfApplied(message),
    };
  }
  return null;
}

/**
 * An operation threw. A `ValidationError` is shown as it is, at its own severity; a
 * `SaveError` was already shown where it was thrown, so it says nothing here; anything else
 * is `Could not <verb>: <message>`.
 */
export function describeOperationError(error: unknown, verb: string): Feedback | null {
  if (isValidationError(error)) return { level: error.severity, message: error.message };
  if (isSaveError(error)) return null;
  return { level: 'error', message: `Could not ${verb}: ${extractErrorMessage(error)}` };
}

import { describe, expect, it } from 'vitest';
import {
  describeFreshFailure,
  describeOperationError,
  describeReplayFailure,
} from '../CommitFeedback';
import { SaveError, ValidationError } from '../../../utils/errors';

const REFUSED = { status: 'refused', changedKeys: ['a', 'b'] } as const;
const CLEAN_SAVE_FAILURE = { status: 'saveFailed', rolledBack: true } as const;
const HALF_SAVE_FAILURE = { status: 'saveFailed', rolledBack: false } as const;

describe('describeFreshFailure', () => {
  it('shows a refused plan as the plain failure, and keeps the keys for the thrown error', () => {
    expect(describeFreshFailure(REFUSED, 'Failed to save')).toEqual({
      toast: { level: 'error', message: 'Failed to save' },
      errorMessage: 'Failed to save: a, b changed',
    });
  });

  it('shows a clean save failure as the failure message alone', () => {
    const { toast, errorMessage } = describeFreshFailure(CLEAN_SAVE_FAILURE, 'Failed to save');
    expect(toast).toEqual({ level: 'error', message: 'Failed to save' });
    expect(errorMessage).toBe('Failed to save');
  });

  it('adds the reload advice when the write-back also failed', () => {
    const { toast, errorMessage } = describeFreshFailure(HALF_SAVE_FAILURE, 'Failed to save');
    expect(toast.message).toMatch(/^Failed to save, and it could not be fully reverted/);
    expect(toast.message).toMatch(/reload dictionaries before editing further$/);
    expect(errorMessage).toBe(toast.message);
  });
});

describe('describeReplayFailure', () => {
  it('warns that a stale undo changed under it, naming the keys', () => {
    expect(describeReplayFailure('undo', REFUSED)).toEqual({
      level: 'warning',
      message: "Can't undo: a, b changed since — edit it directly instead",
    });
  });

  it('names redo for a stale redo', () => {
    expect(describeReplayFailure('redo', REFUSED)?.message).toMatch(/^Can't redo:/);
  });

  it('reports a failed save, with the reload advice only when write-back failed', () => {
    expect(describeReplayFailure('undo', CLEAN_SAVE_FAILURE)).toEqual({
      level: 'error',
      message: 'Failed to save the undo',
    });
    expect(describeReplayFailure('redo', HALF_SAVE_FAILURE)?.message).toMatch(
      /^Failed to save the redo, and it could not be fully reverted.*reload dictionaries/
    );
  });

  it('says nothing for "Nothing to undo", and nothing for success', () => {
    expect(
      describeReplayFailure('undo', { status: 'invalid', reason: 'Nothing to undo' })
    ).toBeNull();
    expect(describeReplayFailure('undo', { status: 'ok', edit: {} as never })).toBeNull();
  });
});

describe('describeOperationError', () => {
  it('shows a validation error as it is, at its own severity', () => {
    expect(describeOperationError(new ValidationError('bad'), 'add entry')).toEqual({
      level: 'error',
      message: 'bad',
    });
    expect(
      describeOperationError(new ValidationError('gone', undefined, undefined, 'warning'), 'x')
    ).toEqual({ level: 'warning', message: 'gone' });
  });

  it('says nothing for a save error, which was shown where it was thrown', () => {
    expect(describeOperationError(new SaveError('disk'), 'add entry')).toBeNull();
  });

  it('wraps anything else with the verb', () => {
    expect(describeOperationError(new Error('boom'), 'rename entry')).toEqual({
      level: 'error',
      message: 'Could not rename entry: boom',
    });
  });
});

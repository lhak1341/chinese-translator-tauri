import { useState, useEffect, useCallback } from 'react';
import type React from 'react';

export interface InlineFieldEdit {
  editing: boolean;
  tempValue: string;
  startEdit: () => void;
  handleChange: (v: string) => void;
  commitEdit: () => Promise<void>;
  cancelEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * State machine for a single inline-editable text field.
 *
 * currentValue must be the live prop value so the sync effect (`!editing →
 * reset tempValue`) always has the post-save canonical value.
 *
 * onCommit is called with the trimmed value, only when it differs from currentValue and is
 * non-empty — or, with `allowEmpty`, empty too: for an optional field, where clearing is an
 * edit (e.g. a Transform Rule's length limit or label). If onCommit throws, the field resets
 * to currentValue and closes.
 */
export function useInlineFieldEdit(
  currentValue: string,
  onCommit: (newValue: string) => Promise<void>,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): InlineFieldEdit {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(currentValue);

  useEffect(() => {
    if (!editing) setTempValue(currentValue);
  }, [currentValue, editing]);

  const startEdit = useCallback(() => setEditing(true), []);
  const handleChange = useCallback((v: string) => setTempValue(v), []);

  const cancelEdit = useCallback(() => {
    setTempValue(currentValue);
    setEditing(false);
  }, [currentValue]);

  const commitEdit = useCallback(async () => {
    const trimmed = tempValue.trim();
    if (trimmed !== currentValue && (trimmed || allowEmpty)) {
      try {
        await onCommit(trimmed);
      } catch {
        setTempValue(currentValue);
        setEditing(false);
        return;
      }
    }
    setEditing(false);
  }, [tempValue, currentValue, onCommit, allowEmpty]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  return { editing, tempValue, startEdit, handleChange, commitEdit, cancelEdit, onKeyDown };
}

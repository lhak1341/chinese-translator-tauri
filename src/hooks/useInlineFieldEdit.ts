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
 * onCommit is called only when the value is dirty and non-empty after trim.
 * If onCommit throws, the field resets to currentValue and closes.
 */
export function useInlineFieldEdit(
  currentValue: string,
  onCommit: (newValue: string) => Promise<void>
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
    if (tempValue !== currentValue && tempValue.trim()) {
      try {
        await onCommit(tempValue.trim());
      } catch {
        setTempValue(currentValue);
        setEditing(false);
        return;
      }
    }
    setEditing(false);
  }, [tempValue, currentValue, onCommit]);

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

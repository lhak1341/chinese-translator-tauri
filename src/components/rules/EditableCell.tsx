import styles from '../../styles/RulesManager.module.css';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';

/** Click-to-edit text/number cell — the same interaction Dictionary's table uses. */
function EditableCell({
  value,
  onCommit,
  type = 'text',
  placeholder,
  label,
}: {
  value: string;
  onCommit: (newValue: string) => Promise<void>;
  type?: 'text' | 'number';
  placeholder?: string;
  label: string;
}) {
  const edit = useInlineFieldEdit(value, onCommit);

  if (edit.editing) {
    return (
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        autoFocus
        aria-label={label}
        value={edit.tempValue}
        onChange={(e) => edit.handleChange(e.target.value)}
        onBlur={() => edit.commitEdit()}
        onKeyDown={edit.onKeyDown}
      />
    );
  }
  return (
    <span
      onClick={edit.startEdit}
      className={value ? undefined : styles.placeholderText}
      style={{ cursor: 'pointer' }}
      title="Click to edit"
      aria-label={label}
    >
      {value || placeholder || '—'}
    </span>
  );
}

export default EditableCell;

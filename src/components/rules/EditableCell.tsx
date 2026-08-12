import styles from '../../styles/RulesManager.module.css';
import { useInlineFieldEdit, type InlineFieldEdit } from '../../hooks/useInlineFieldEdit';

/**
 * Click-to-edit text/number cell — the same interaction Dictionary's table uses.
 *
 * `edit` lets a caller that needs to observe `.editing` externally (e.g. to hide a
 * sibling badge mid-edit — see RuleMatchesModal's MatchRow) build its own
 * useInlineFieldEdit instance and pass it in. Callers that don't need that
 * (RuleRow's 6 field cells) omit it and EditableCell builds one internally, same
 * as before this prop existed.
 */
function EditableCell({
  value,
  onCommit,
  type = 'text',
  placeholder,
  label,
  edit: externalEdit,
  inputClassName,
  spanClassName,
  title = 'Click to edit',
}: {
  value: string;
  onCommit: (newValue: string) => Promise<void>;
  type?: 'text' | 'number';
  placeholder?: string;
  label: string;
  edit?: InlineFieldEdit;
  inputClassName?: string;
  spanClassName?: string;
  title?: string;
}) {
  const internalEdit = useInlineFieldEdit(value, onCommit);
  const edit = externalEdit ?? internalEdit;

  if (edit.editing) {
    return (
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        autoFocus
        aria-label={label}
        className={inputClassName}
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
      className={[value ? undefined : styles.placeholderText, spanClassName]
        .filter(Boolean)
        .join(' ')}
      style={{ cursor: 'pointer' }}
      title={title}
      aria-label={label}
    >
      {value || placeholder || '—'}
    </span>
  );
}

export default EditableCell;

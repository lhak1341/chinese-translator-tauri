import styles from '../../styles/RulesManager.module.css';
import { useInlineFieldEdit, type InlineFieldEdit } from '../../hooks/useInlineFieldEdit';

interface RenderProps {
  value: string;
  type?: 'text' | 'number';
  placeholder?: string;
  label: string;
  inputClassName?: string;
  spanClassName?: string;
  title?: string;
}

function renderEditableCell(edit: InlineFieldEdit, props: RenderProps) {
  const {
    value,
    type = 'text',
    placeholder,
    label,
    inputClassName,
    spanClassName,
    title = 'Click to edit',
  } = props;

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

/** Click-to-edit text/number cell — the same interaction Dictionary's table uses. */
function EditableCell({
  value,
  onCommit,
  ...renderProps
}: RenderProps & { onCommit: (newValue: string) => Promise<void> }) {
  const edit = useInlineFieldEdit(value, onCommit);
  return renderEditableCell(edit, { value, ...renderProps });
}

/**
 * Controlled variant for a caller that already owns a `useInlineFieldEdit`
 * instance and needs to observe `.editing` externally (e.g. to hide a sibling
 * badge mid-edit — see RuleMatchesModal's MatchRow). No internal edit state.
 */
export function ControlledEditableCell({
  edit,
  value,
  ...renderProps
}: RenderProps & { edit: InlineFieldEdit }) {
  return renderEditableCell(edit, { value, ...renderProps });
}

export default EditableCell;

import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import type { TransformRuleMatchKind } from '../../types/TransformRuleTypes';

/** Suffix/prefix toggle — same chip styling as Dictionary's badge convention
 * (fontSize/padding), instead of a `<select>`, which crops in a narrow table cell.
 * Always exactly one of the two is active — clicking the active one is a no-op. */
function MatchKindToggle({
  value,
  onSelect,
  label,
}: {
  value: TransformRuleMatchKind;
  onSelect: (matchKind: TransformRuleMatchKind) => void;
  label: string;
}) {
  const options: { value: TransformRuleMatchKind; abbrev: string }[] = [
    { value: 'prefix', abbrev: 'PRE' },
    { value: 'suffix', abbrev: 'SUF' },
  ];
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
      {options.map(({ value: option, abbrev }) => {
        const isActive = value === option;
        return (
          <span
            key={option}
            role="button"
            aria-label={`Set ${option} for ${label}`}
            onClick={() => !isActive && onSelect(option)}
            className={dictStyles.metadataBadge}
            title={isActive ? option : `Set as ${option}`}
            style={{
              background: isActive ? 'var(--primary-color, #3b82f6)' : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {abbrev}
          </span>
        );
      })}
    </div>
  );
}

export default MatchKindToggle;

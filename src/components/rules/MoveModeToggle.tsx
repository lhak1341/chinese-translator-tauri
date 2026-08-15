import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

/** Relocate/in-place toggle for `moveWords` — same chip styling/shape as `MatchKindToggle`,
 * for the same reason (a `<select>` or a bare numeric input crops/misleads in a narrow
 * table cell). `moveWords` is always a boolean flag (see `applyRule`'s doc comment in
 * `TransformRuleEngine.ts`): MOVE relocates the key's words (or, with `moveReplacement`
 * set, the replacement text) to the opposite end; STAY leaves them in the key's own
 * position. */
function MoveModeToggle({
  isRelocate,
  onToggle,
  label,
}: {
  isRelocate: boolean;
  onToggle: (isRelocate: boolean) => void;
  label: string;
}) {
  const options: { value: boolean; abbrev: string; title: string }[] = [
    { value: false, abbrev: 'STAY', title: 'Stay in place' },
    { value: true, abbrev: 'MOVE', title: 'Relocate to opposite end' },
  ];
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
      {options.map(({ value: option, abbrev, title }) => {
        const isActive = isRelocate === option;
        return (
          <span
            key={abbrev}
            role="button"
            aria-label={`Set ${title} for ${label}`}
            onClick={() => !isActive && onToggle(option)}
            className={dictStyles.metadataBadge}
            title={isActive ? title : `Set: ${title}`}
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

export default MoveModeToggle;

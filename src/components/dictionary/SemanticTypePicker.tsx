import React from 'react';
import {
  SEMANTIC_TYPE_LIST,
  SEMANTIC_TYPE_LABELS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_COLORS,
  PATTERN_SEMANTIC_TYPE_REF_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';
import styles from '../../styles/DictionaryEntry.module.css';
import { isPatternsDict, isLookupTableDict } from '../../utils/dictionary';

interface SemanticTypePickerProps {
  semanticType: SemanticType | PatternSemanticTypeRef | '';
  onSemanticTypeChange: (type: SemanticType | PatternSemanticTypeRef | '') => void;
  allowedVariableTypes: Record<string, string[]>;
  onAllowedVariableTypesChange: (types: Record<string, string[]>) => void;
  activeDictionary: string;
  /** Pattern source text — drives X/Y variable detection */
  source: string;
  isSaving: boolean;
}

const supportsSemanticTypes = (activeDictionary: string): boolean =>
  !isLookupTableDict(activeDictionary);

/**
 * The radio/checkbox badge recipe shared by all 4 selectable-badge groups in this file (the
 * "None" option, canonical semantic types, `$X`/`$Y` variable refs, per-variable constraints)
 * — was hand-copied 4 times with identical role/aria-checked/tabIndex/onKeyDown wiring
 * (architecture review 2026-09-09, candidate #3 grilling). Local, not exported: zero callers
 * outside this file today, so this stays a private dedup rather than a cross-file seam (one
 * adapter is a hypothetical seam, two is real — `TableBuildingBlocks.tsx`'s `CheckboxCell`
 * doc comment states the same policy).
 *
 * Deliberately NOT `TableBuildingBlocks.tsx`'s `BadgeChip`: that component's inactive state is
 * fixed gray (`#9ca3af`/`#d1d5db`) regardless of `activeColor` — every real `BadgeChip` caller
 * wants that. This component's 4 callers all want the opposite: a colored outline even when
 * inactive (`activeColor` is the inactive text/border color too, filled only when `checked`).
 * `disabled` (not on `BadgeChip` at all) drives the `isSaving`-gated opacity/cursor/tabIndex/
 * click-swallow every caller here needs. `dashed` is the `$X`/`$Y` block's one further
 * divergence — dashed border when unchecked, solid when checked; the other 3 callers leave it
 * at its default (always solid).
 */
const AccessibleBadgeChip: React.FC<{
  role: 'radio' | 'checkbox';
  checked: boolean;
  activeColor: string;
  dashed?: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ role, checked, activeColor, dashed = false, disabled, onClick, title, children }) => (
  <span
    role={role}
    aria-checked={checked}
    tabIndex={disabled ? -1 : 0}
    onClick={() => {
      if (!disabled) onClick();
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!disabled) onClick();
      }
    }}
    style={{
      display: 'inline-block',
      padding: '2px 6px',
      fontSize: '0.7rem',
      fontWeight: 600,
      borderRadius: '4px',
      cursor: disabled ? 'default' : 'pointer',
      userSelect: 'none',
      opacity: disabled ? 0.5 : 1,
      background: checked ? activeColor : 'transparent',
      color: checked ? 'white' : activeColor,
      border: `1px ${!checked && dashed ? 'dashed' : 'solid'} ${activeColor}`,
    }}
    title={title}
  >
    {children}
  </span>
);

/**
 * Semantic type badge picker and per-variable type constraint toggles.
 * Renders null for dictionary types that don't support semantic metadata.
 */
export const SemanticTypePicker: React.FC<SemanticTypePickerProps> = ({
  semanticType,
  onSemanticTypeChange,
  allowedVariableTypes,
  onAllowedVariableTypesChange,
  activeDictionary,
  source,
  isSaving,
}) => {
  if (!supportsSemanticTypes(activeDictionary)) return null;

  const isPatterns = isPatternsDict(activeDictionary);
  const activeVars = (['X', 'Y'] as const).filter((v) => source.includes(v));

  return (
    <>
      {/* Output semantic type badge picker */}
      <div className={styles.formGroup}>
        <label className={`${styles.label} ${styles.labelCentered}`}>
          {isPatterns ? 'Output type' : 'Semantic Type'}
        </label>
        {isPatterns && (
          <p
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted, #6b7280)',
              margin: '0 0 0.4rem',
              textAlign: 'center',
            }}
          >
            Type produced when reused elsewhere. Blank = any type.
          </p>
        )}
        <div
          role="radiogroup"
          aria-label="Semantic type"
          style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {/* None option */}
          <AccessibleBadgeChip
            role="radio"
            checked={semanticType === ''}
            activeColor="var(--text-muted, #6b7280)"
            disabled={isSaving}
            onClick={() => onSemanticTypeChange('')}
            title="No semantic type"
          >
            None
          </AccessibleBadgeChip>

          {/* Canonical semantic type badges */}
          {SEMANTIC_TYPE_LIST.map((type) => {
            const isSelected = semanticType === type;
            return (
              <AccessibleBadgeChip
                key={type}
                role="radio"
                checked={isSelected}
                activeColor={SEMANTIC_TYPE_COLORS[type]}
                disabled={isSaving}
                onClick={() => onSemanticTypeChange(isSelected ? '' : type)}
                title={`${isSelected ? 'Clear' : 'Set'} semantic type: ${SEMANTIC_TYPE_LABELS[type]}`}
              >
                {SEMANTIC_TYPE_ABBREVIATIONS[type]}
              </AccessibleBadgeChip>
            );
          })}

          {/* $X / $Y variable-ref badges — patterns only */}
          {isPatterns &&
            PATTERN_SEMANTIC_TYPE_REF_LIST.filter((r) => source.includes(r[1])).map((typeRef) => {
              const isSelected = semanticType === typeRef;
              const varName = typeRef[1];
              return (
                <AccessibleBadgeChip
                  key={typeRef}
                  role="radio"
                  checked={isSelected}
                  activeColor="#8b5cf6"
                  dashed
                  disabled={isSaving}
                  onClick={() => onSemanticTypeChange(isSelected ? '' : typeRef)}
                  title={`${isSelected ? 'Clear' : 'Set'} semantic type: inherit from variable ${varName}`}
                >
                  {typeRef}
                </AccessibleBadgeChip>
              );
            })}
        </div>
      </div>

      {/* Per-variable type constraints — patterns only. Side by side when both
          X and Y are present, so they read as a pair rather than two full-width
          stacked rows. */}
      {isPatterns && activeVars.length > 0 && (
        <div className={styles.formGroupRow}>
          {activeVars.map((varName) => (
            <div className={styles.formGroup} key={varName}>
              <label className={`${styles.label} ${styles.labelCentered}`}>
                {varName} allowed types
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: '0.3rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {SEMANTIC_TYPE_LIST.map((type) => {
                  const isActive = (allowedVariableTypes[varName] || []).includes(type);
                  const toggle = () => {
                    const current = allowedVariableTypes[varName] || [];
                    const next = isActive ? current.filter((t) => t !== type) : [...current, type];
                    if (next.length === 0) {
                      const { [varName]: _, ...rest } = allowedVariableTypes;
                      onAllowedVariableTypesChange(rest);
                    } else {
                      onAllowedVariableTypesChange({ ...allowedVariableTypes, [varName]: next });
                    }
                  };
                  return (
                    <AccessibleBadgeChip
                      key={type}
                      role="checkbox"
                      checked={isActive}
                      activeColor={SEMANTIC_TYPE_COLORS[type]}
                      disabled={isSaving}
                      onClick={toggle}
                      title={`${isActive ? 'Remove' : 'Add'} ${SEMANTIC_TYPE_LABELS[type]} constraint for ${varName}`}
                    >
                      {SEMANTIC_TYPE_ABBREVIATIONS[type]}
                    </AccessibleBadgeChip>
                  );
                })}
              </div>
              {!(allowedVariableTypes[varName]?.length > 0) && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.25rem',
                    textAlign: 'center',
                  }}
                >
                  No constraint — matches any type
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

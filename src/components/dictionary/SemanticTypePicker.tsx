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
import { classifyDictionaryId } from '../../utils/dictionary';

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

const supportsSemanticTypes = (activeDictionary: string): boolean => {
  const { isPatterns, isPhrases, isProperNouns } = classifyDictionaryId(activeDictionary);
  return isPhrases || isProperNouns || isPatterns;
};

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

  const { isPatterns } = classifyDictionaryId(activeDictionary);

  const badgeBase: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '0.75rem',
    fontWeight: 600,
    borderRadius: '4px',
    cursor: isSaving ? 'default' : 'pointer',
    userSelect: 'none',
    opacity: isSaving ? 0.5 : 1,
  };

  return (
    <>
      {/* Output semantic type badge picker */}
      <div className={styles.formGroup}>
        <label className={`${styles.label} ${styles.labelCentered}`}>
          {isPatterns ? 'Output Semantic Type' : 'Semantic Type'}
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
            Type this pattern produces when used as a variable in another pattern. Leave blank to
            match any variable slot.
          </p>
        )}
        <div
          role="radiogroup"
          aria-label="Semantic type"
          style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {/* None option */}
          <span
            role="radio"
            aria-checked={semanticType === ''}
            tabIndex={isSaving ? -1 : 0}
            onClick={() => {
              if (!isSaving) onSemanticTypeChange('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isSaving) onSemanticTypeChange('');
              }
            }}
            style={{
              ...badgeBase,
              background: semanticType === '' ? 'var(--text-muted, #6b7280)' : 'transparent',
              color: semanticType === '' ? 'white' : 'var(--text-muted, #6b7280)',
              border: '1px solid var(--text-muted, #6b7280)',
            }}
            title="No semantic type"
          >
            None
          </span>

          {/* Canonical semantic type badges */}
          {SEMANTIC_TYPE_LIST.map((type) => {
            const isSelected = semanticType === type;
            const select = () => {
              if (!isSaving) onSemanticTypeChange(isSelected ? '' : type);
            };
            return (
              <span
                key={type}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSaving ? -1 : 0}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select();
                  }
                }}
                style={{
                  ...badgeBase,
                  background: isSelected ? SEMANTIC_TYPE_COLORS[type] : 'transparent',
                  color: isSelected ? 'white' : SEMANTIC_TYPE_COLORS[type],
                  border: `1px solid ${SEMANTIC_TYPE_COLORS[type]}`,
                }}
                title={`${isSelected ? 'Clear' : 'Set'} semantic type: ${SEMANTIC_TYPE_LABELS[type]}`}
              >
                {SEMANTIC_TYPE_ABBREVIATIONS[type]}
              </span>
            );
          })}

          {/* $X / $Y variable-ref badges — patterns only */}
          {isPatterns &&
            PATTERN_SEMANTIC_TYPE_REF_LIST.filter((r) => source.includes(r[1])).map((typeRef) => {
              const isSelected = semanticType === typeRef;
              const varName = typeRef[1];
              const select = () => {
                if (!isSaving) onSemanticTypeChange(isSelected ? '' : typeRef);
              };
              return (
                <span
                  key={typeRef}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSaving ? -1 : 0}
                  onClick={select}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select();
                    }
                  }}
                  style={{
                    ...badgeBase,
                    background: isSelected ? '#8b5cf6' : 'transparent',
                    color: isSelected ? 'white' : '#8b5cf6',
                    border: `1px ${isSelected ? 'solid' : 'dashed'} #8b5cf6`,
                  }}
                  title={`${isSelected ? 'Clear' : 'Set'} semantic type: inherit from variable ${varName}`}
                >
                  {typeRef}
                </span>
              );
            })}
        </div>
      </div>

      {/* Per-variable type constraints — patterns only */}
      {isPatterns &&
        (['X', 'Y'] as const)
          .filter((v) => source.includes(v))
          .map((varName) => (
            <div className={styles.formGroup} key={varName}>
              <label className={`${styles.label} ${styles.labelCentered}`}>
                Variable {varName} allowed types
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {SEMANTIC_TYPE_LIST.map((type) => {
                  const isActive = (allowedVariableTypes[varName] || []).includes(type);
                  const toggle = () => {
                    if (isSaving) return;
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
                    <span
                      key={type}
                      role="checkbox"
                      aria-checked={isActive}
                      tabIndex={isSaving ? -1 : 0}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      style={{
                        ...badgeBase,
                        background: isActive ? SEMANTIC_TYPE_COLORS[type] : 'transparent',
                        color: isActive ? 'white' : SEMANTIC_TYPE_COLORS[type],
                        border: `1px solid ${SEMANTIC_TYPE_COLORS[type]}`,
                      }}
                      title={`${isActive ? 'Remove' : 'Add'} ${SEMANTIC_TYPE_LABELS[type]} constraint for ${varName}`}
                    >
                      {SEMANTIC_TYPE_ABBREVIATIONS[type]}
                    </span>
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
                  No constraints — {varName} matches all variable entries
                </div>
              )}
            </div>
          ))}
    </>
  );
};

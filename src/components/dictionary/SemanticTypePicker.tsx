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
import { isPatternsDict, entryCapabilities, showsSemanticType } from '../../utils/dictionary';
import { PATTERN_VARIABLE_COLORS } from '../../utils/text';

interface SemanticTypePickerProps {
  semanticType: SemanticType | PatternSemanticTypeRef | '';
  onSemanticTypeChange: (type: SemanticType | PatternSemanticTypeRef | '') => void;
  allowedVariableTypes: Record<string, string[]>;
  onAllowedVariableTypesChange: (types: Record<string, string[]>) => void;
  activeDictionary: string;
  /** The entry's VAR flag — for phrases and patterns, the type row shows only once it is on. */
  allowAsPatternVariable: boolean;
  /** Pattern source text — drives X/Y variable detection */
  source: string;
  isSaving: boolean;
}

const REF_COLOR = '#8b5cf6';
const NONE_COLOR = 'var(--text-muted, #6b7280)';

/**
 * Each badge row is one Tab stop (roving tabindex): Tab/Shift-Tab leave the row, and the
 * arrow keys move focus between its badges without changing anything. Returns whether `e` was
 * an arrow key it handled.
 */
function moveFocusByArrow(e: React.KeyboardEvent<HTMLElement>): boolean {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step === undefined || e.metaKey || e.ctrlKey || e.altKey) return false;
  const badges = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]')
  );
  const from = badges.indexOf(document.activeElement as HTMLElement);
  if (from === -1) return false;
  e.preventDefault();
  badges[(from + step + badges.length) % badges.length].focus();
  return true;
}

/** The digit an unmodified 0-9 key press types, else `null`. With focus anywhere in a badge
 * row, that digit toggles the badge at its position (`data-hint` shows which). */
function digitOf(e: React.KeyboardEvent): number | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  return /^[0-9]$/.test(e.key) ? Number(e.key) : null;
}

/**
 * The radio/checkbox badge every cell of the type grid is — was hand-copied 4 times with
 * identical role/aria-checked/tabIndex/onKeyDown wiring (architecture review 2026-09-09,
 * candidate #3 grilling). Local, not exported: zero callers outside this file today, so this
 * stays a private dedup rather than a cross-file seam (one adapter is a hypothetical seam, two
 * is real — `TableBuildingBlocks.tsx`'s `CheckboxCell` doc comment states the same policy).
 *
 * Deliberately NOT `TableBuildingBlocks.tsx`'s `BadgeChip`: that component's inactive state is
 * fixed gray regardless of `activeColor`; here the color is the inactive outline too, filled
 * only when `checked`. Three looks, one behavior: `badge` (a labelled chip — the Output row),
 * `box` (an unlabelled tick box under a badge's column — the X/Y rows, named by `title`), and
 * `any` (the X/Y rows' first cell: checked while no type is ticked). `dashed` marks the
 * `$X`/`$Y` badges, whose type is inherited rather than chosen. `disabled` is the `isSaving`
 * gate.
 */
const AccessibleBadgeChip: React.FC<{
  role: 'radio' | 'checkbox';
  variant?: 'badge' | 'box' | 'any';
  checked: boolean;
  activeColor: string;
  dashed?: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  /** Accessible name; defaults to the text for badges and to `title` for boxes. */
  ariaLabel?: string;
  /** The digit key that toggles this badge, shown while its row has focus. */
  hint: number;
  /** Whether this badge is its row's one Tab stop (see `moveFocusByArrow`). */
  tabStop: boolean;
  children?: React.ReactNode;
}> = ({
  role,
  variant = 'badge',
  checked,
  activeColor,
  dashed = false,
  disabled,
  onClick,
  title,
  ariaLabel,
  hint,
  tabStop,
  children,
}) => (
  <span
    role={role}
    aria-checked={checked}
    aria-disabled={disabled || undefined}
    aria-label={ariaLabel ?? (variant === 'box' ? title : undefined)}
    aria-keyshortcuts={String(hint)}
    data-hint={hint}
    tabIndex={disabled || !tabStop ? -1 : 0}
    onClick={() => {
      if (!disabled) onClick();
    }}
    onKeyDown={(e) => {
      // Cmd/Ctrl-Enter is the Add form's Save, not a toggle.
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === ' ') {
        e.preventDefault();
        if (!disabled) onClick();
      }
    }}
    className={`${styles.typeCell} ${styles[variant]} ${checked ? styles.checked : ''} ${dashed ? styles.dashed : ''} ${disabled ? styles.cellDisabled : ''}`}
    style={{ '--c': activeColor } as React.CSSProperties}
    title={title}
  >
    {children}
  </span>
);

/**
 * The Add form's type grid. One row picks the entry's semantic type ("Output" for a pattern);
 * a pattern also gets a row per variable in its source for what that variable accepts. Every
 * row shares one set of columns, so the six type names appear once, on the first row. The
 * first column means "no restriction" in every row — None for the type, any for a variable —
 * and its digit is 0 everywhere. The type row follows `showsSemanticType`, the variable rows
 * the kind's `variableTypes` — a pattern's variable rows stay while VAR is off. Renders null when
 * neither applies.
 */
export const SemanticTypePicker: React.FC<SemanticTypePickerProps> = ({
  semanticType,
  onSemanticTypeChange,
  allowedVariableTypes,
  onAllowedVariableTypesChange,
  activeDictionary,
  allowAsPatternVariable,
  source,
  isSaving,
}) => {
  const showTypeRow = showsSemanticType(activeDictionary, allowAsPatternVariable);
  const { variableTypes } = entryCapabilities(activeDictionary);
  if (!showTypeRow && !variableTypes) return null;

  const isPatterns = isPatternsDict(activeDictionary);
  const activeVars = variableTypes ? (['X', 'Y'] as const).filter((v) => source.includes(v)) : [];
  const typeRefs = variableTypes
    ? PATTERN_SEMANTIC_TYPE_REF_LIST.filter((r) => source.includes(r[1]))
    : [];
  // Radio options in badge order, so each one's index is its digit key: 0 None, 1-6 the
  // canonical types, then $X/$Y.
  const radioOptions: (SemanticType | PatternSemanticTypeRef | '')[] = [
    '',
    ...SEMANTIC_TYPE_LIST,
    ...typeRefs,
  ];

  // The row's Tab stop is the selected option — None when nothing (shown) is selected.
  const radioTabStop = Math.max(0, radioOptions.indexOf(semanticType));

  const handleRadioKey = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (moveFocusByArrow(e)) return;
    const digit = digitOf(e);
    const option = digit === null ? undefined : radioOptions[digit];
    if (option === undefined) return;
    e.preventDefault();
    if (!isSaving) onSemanticTypeChange(semanticType === option ? '' : option);
  };

  const clearConstraint = (varName: string): void => {
    const { [varName]: _, ...rest } = allowedVariableTypes;
    onAllowedVariableTypesChange(rest);
  };

  const toggleConstraint = (varName: string, type: SemanticType): void => {
    const current = allowedVariableTypes[varName] || [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    if (next.length === 0) clearConstraint(varName);
    else onAllowedVariableTypesChange({ ...allowedVariableTypes, [varName]: next });
  };

  // A variable row's Tab stop is its first ticked type, else "any".
  const constraintTabStop = (varName: string): number =>
    SEMANTIC_TYPE_LIST.findIndex((t) => allowedVariableTypes[varName]?.includes(t)) + 1;

  const handleConstraintKey = (e: React.KeyboardEvent<HTMLElement>, varName: string): void => {
    if (moveFocusByArrow(e)) return;
    const digit = digitOf(e);
    if (digit === null || digit > SEMANTIC_TYPE_LIST.length) return;
    e.preventDefault();
    if (isSaving) return;
    if (digit === 0) clearConstraint(varName);
    else toggleConstraint(varName, SEMANTIC_TYPE_LIST[digit - 1]);
  };

  // Every cell the same width — None, the six types, $X/$Y — so the chips line up as one
  // even row instead of stretching to fill the form.
  const columns = `3.9rem repeat(${radioOptions.length}, 2.6rem)`;

  return (
    <div className={styles.typeGrid} style={{ gridTemplateColumns: columns }}>
      {showTypeRow && (
        <>
          <span
            className={styles.typeRowLabel}
            title={isPatterns ? 'The type this pattern produces when reused elsewhere' : undefined}
          >
            {isPatterns ? 'Output' : 'Type'}
          </span>
          <div
            role="radiogroup"
            aria-label="Semantic type"
            className={`${styles.typeRow} ${styles.digitGroup}`}
            onKeyDown={handleRadioKey}
          >
            <AccessibleBadgeChip
              role="radio"
              checked={semanticType === ''}
              activeColor={NONE_COLOR}
              disabled={isSaving}
              onClick={() => onSemanticTypeChange('')}
              title="No semantic type"
              hint={0}
              tabStop={radioTabStop === 0}
            >
              None
            </AccessibleBadgeChip>
            {SEMANTIC_TYPE_LIST.map((type, i) => {
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
                  hint={i + 1}
                  tabStop={radioTabStop === i + 1}
                >
                  {SEMANTIC_TYPE_ABBREVIATIONS[type]}
                </AccessibleBadgeChip>
              );
            })}
            {typeRefs.map((typeRef, i) => {
              const isSelected = semanticType === typeRef;
              const hint = SEMANTIC_TYPE_LIST.length + 1 + i;
              return (
                <AccessibleBadgeChip
                  key={typeRef}
                  role="radio"
                  checked={isSelected}
                  activeColor={REF_COLOR}
                  dashed
                  disabled={isSaving}
                  onClick={() => onSemanticTypeChange(isSelected ? '' : typeRef)}
                  title={`${isSelected ? 'Clear' : 'Set'} semantic type: inherit from variable ${typeRef[1]}`}
                  hint={hint}
                  tabStop={radioTabStop === hint}
                >
                  {typeRef}
                </AccessibleBadgeChip>
              );
            })}
          </div>
        </>
      )}

      {activeVars.map((varName) => {
        const allowed = allowedVariableTypes[varName] ?? [];
        const stop = constraintTabStop(varName);
        return (
          <React.Fragment key={varName}>
            <span className={styles.typeRowLabel}>
              <b className={styles.typeRowVar} style={{ color: PATTERN_VARIABLE_COLORS[varName] }}>
                {varName}
              </b>{' '}
              accepts
            </span>
            <div
              role="group"
              aria-label={`${varName} accepts`}
              className={`${styles.typeRow} ${styles.digitGroup}`}
              onKeyDown={(e) => handleConstraintKey(e, varName)}
            >
              <AccessibleBadgeChip
                role="checkbox"
                variant="any"
                checked={allowed.length === 0}
                activeColor={NONE_COLOR}
                disabled={isSaving}
                onClick={() => clearConstraint(varName)}
                title={`${varName} accepts any type`}
                hint={0}
                tabStop={stop === 0}
              >
                any
              </AccessibleBadgeChip>
              {SEMANTIC_TYPE_LIST.map((type, i) => {
                const isActive = allowed.includes(type);
                return (
                  <AccessibleBadgeChip
                    key={type}
                    role="checkbox"
                    variant="box"
                    checked={isActive}
                    activeColor={SEMANTIC_TYPE_COLORS[type]}
                    disabled={isSaving}
                    onClick={() => toggleConstraint(varName, type)}
                    title={`${isActive ? 'Remove' : 'Add'} ${SEMANTIC_TYPE_LABELS[type]} constraint for ${varName}`}
                    hint={i + 1}
                    tabStop={stop === i + 1}
                  />
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * A type row for a field that must have a type — a Transform Rule's. The Add form's Output row
 * without None, and picking the selected type again keeps it. Same badges and keys: one Tab
 * stop, arrows move, 1-6 pick. Renders its label and its badges as two grid items, so it sits
 * in a `typeGrid` whose columns the caller sets (`3.9rem repeat(6, 2.6rem)`).
 *
 * `rowLabel` names each badge "Set <Type> for <rowLabel>", as `SemanticTypeToggleCell` does.
 */
export const RequiredSemanticTypeRow: React.FC<{
  value: SemanticType;
  onChange: (type: SemanticType) => void;
  rowLabel: string;
  disabled?: boolean;
}> = ({ value, onChange, rowLabel, disabled = false }) => {
  const tabStop = Math.max(0, SEMANTIC_TYPE_LIST.indexOf(value));

  const handleKey = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (moveFocusByArrow(e)) return;
    const digit = digitOf(e);
    const type = digit === null ? undefined : SEMANTIC_TYPE_LIST[digit - 1];
    if (type === undefined) return;
    e.preventDefault();
    if (!disabled) onChange(type);
  };

  return (
    <>
      <span className={styles.typeRowLabel}>Type</span>
      <div
        role="radiogroup"
        aria-label="Semantic type"
        className={`${styles.typeRow} ${styles.digitGroup}`}
        onKeyDown={handleKey}
      >
        {SEMANTIC_TYPE_LIST.map((type, i) => (
          <AccessibleBadgeChip
            key={type}
            role="radio"
            checked={value === type}
            activeColor={SEMANTIC_TYPE_COLORS[type]}
            disabled={disabled}
            onClick={() => onChange(type)}
            title={SEMANTIC_TYPE_LABELS[type]}
            ariaLabel={`Set ${SEMANTIC_TYPE_LABELS[type]} for ${rowLabel}`}
            hint={i + 1}
            tabStop={i === tabStop}
          >
            {SEMANTIC_TYPE_ABBREVIATIONS[type]}
          </AccessibleBadgeChip>
        ))}
      </div>
    </>
  );
};

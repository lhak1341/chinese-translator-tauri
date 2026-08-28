import React from 'react';
import { classifyDictionaryId, buildEntryMetadata } from '../../utils/dictionary';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import type { InlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { useEntryMetadataEdit } from '../../hooks/useEntryMetadataEdit';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_LABELS,
  SEMANTIC_TYPE_LIST,
  PATTERN_SEMANTIC_TYPE_REF_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import type { DictionaryEntryValue } from '../../types/DictionaryTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { highlightPatternVariables } from '../../utils/text';

/** Height of each table row in pixels. Exported so the table can compute totalHeight. */
export const ITEM_HEIGHT = 40;

/** Width of the per-row Semantic-type column (patterns/phrases/properNouns). Shared constant
 * rather than a CSS class because `SemanticTypeToggleCell`'s width is a JS prop — it's reused
 * outside Dictionary (Rules tab) with its own widths, so the column-width mechanism here can't
 * be a className the way Source/Translation are (architecture review 2026-08-28, candidate #2
 * grilling). */
export const DICTIONARY_SEMANTIC_COLUMN_WIDTH = '15%';

interface BadgeProps {
  type: 'variable';
  active: boolean;
  onClick: () => void;
}

/** Exported so other table-shaped views (e.g. the Rules tab's match preview) can reuse
 * the exact VAR toggle chip instead of re-deriving its colors/labels. */
export const MetadataBadge: React.FC<BadgeProps> = ({ active, onClick }) => {
  const config = {
    label: 'VAR',
    title: active ? 'Click to disallow as variable' : 'Click to allow as variable',
    activeColor: '#059669',
    inactiveColor: '#6b7280',
  };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={config.title}
      className={styles.metadataBadge}
      style={{
        background: active ? config.activeColor : 'transparent',
        color: active ? 'white' : config.inactiveColor,
        border: active ? 'none' : `1px solid ${config.inactiveColor}`,
      }}
    >
      {active && '✓ '}
      {config.label}
    </span>
  );
};

interface FilterChipButtonProps {
  active: boolean;
  activeColor: string;
  inactiveColor?: string;
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

/** Active/inactive toggle-chip button for filter bars — the shape `SemanticTypeFilterChips`
 * below and `EnhancedVirtualizedDictionaryTable`'s FilterPanel buttons were each hand-rolling
 * independently (architecture review 2026-08-24, candidate #3 grilling). `style` is an escape
 * hatch for one-off per-instance overrides (e.g. Clear-filters' `marginLeft: 'auto'`, or a
 * chip that stays bold regardless of active state) — spread last, wins over the computed
 * defaults. */
export const FilterChipButton: React.FC<FilterChipButtonProps> = ({
  active,
  activeColor,
  inactiveColor = 'var(--text-color)',
  label,
  onClick,
  ariaLabel,
  style,
}) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      padding: '0.2rem 0.5rem',
      fontSize: '0.75rem',
      borderRadius: '4px',
      border: `1px solid ${active ? activeColor : 'var(--border-color)'}`,
      cursor: 'pointer',
      backgroundColor: active ? activeColor : 'transparent',
      color: active ? 'white' : inactiveColor,
      fontWeight: active ? 600 : 400,
      ...style,
    }}
  >
    {label}
  </button>
);

const TypeToggleCell: React.FC<{
  varName: string;
  hasVariable: boolean;
  activeTypes: string[];
  onToggle: (varName: string, type: string) => void;
}> = ({ varName, hasVariable, activeTypes, onToggle }) => {
  if (!hasVariable) {
    return (
      <div
        className={styles.patternsTypeCol}
        style={{
          padding: '0 0.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>--</span>
      </div>
    );
  }
  return (
    <div
      className={styles.patternsTypeCol}
      style={{
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_LIST.map((type) => {
        const isActive = activeTypes.includes(type);
        const label = SEMANTIC_TYPE_ABBREVIATIONS[type];
        const color = SEMANTIC_TYPE_COLORS[type as SemanticType];
        return (
          <span
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(varName, type);
            }}
            className={styles.metadataBadge}
            title={`${isActive ? 'Remove' : 'Add'} ${type} for ${varName}`}
            style={{
              background: isActive ? color : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};

/** Exported for the same reason as `MetadataBadge` — reuse, not re-derive.
 * `clearable=false` (Rules tab's semanticType, which is required/non-clearable):
 * clicking the active chip no-ops instead of calling `onSelect('')`, and the tooltip
 * drops the "(click to remove)" suffix since removal isn't possible.
 * `size="form"` is a larger variant for spacious form contexts (Rules tab's
 * NewRuleModal) where the table-cell scale reads as too small — still built on
 * `.metadataBadge`, just bigger padding/font. `align="left"` matches a left-aligned
 * label above it (form layout); default `"center"` matches table-cell usage.
 * `rowLabel` (optional): when a view renders many rows of this cell at once (e.g. the
 * Rules tab's table), pass a per-row identifier so each chip gets a distinct
 * `aria-label` ("Set Object for City suffix") — otherwise every row's "Object" chip
 * is indistinguishable to assistive tech / `getByLabelText`. */
export const SemanticTypeToggleCell: React.FC<{
  activeType: string;
  onSelect: (type: string) => void;
  width?: string;
  patternSource?: string;
  clearable?: boolean;
  size?: 'table' | 'form';
  align?: 'center' | 'left';
  rowLabel?: string;
}> = ({
  activeType,
  onSelect,
  width = '15%',
  patternSource,
  clearable = true,
  size = 'table',
  align = 'center',
  rowLabel,
}) => {
  const badgeSize =
    size === 'form'
      ? { fontSize: '0.7rem', padding: '2px 6px' }
      : { fontSize: '0.6rem', padding: '1px 3px' };
  return (
    <div
      style={{
        width,
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_LIST.map((type) => {
        const isActive = activeType === type;
        const label = SEMANTIC_TYPE_ABBREVIATIONS[type];
        const color = SEMANTIC_TYPE_COLORS[type as SemanticType];
        return (
          <span
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              if (isActive) {
                if (clearable) onSelect('');
                return;
              }
              onSelect(type);
            }}
            className={styles.metadataBadge}
            {...(rowLabel && {
              'aria-label': `Set ${SEMANTIC_TYPE_LABELS[type as SemanticType]} for ${rowLabel}`,
            })}
            title={isActive ? (clearable ? `${type} (click to remove)` : type) : `Set as ${type}`}
            style={{
              background: isActive ? color : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              cursor: 'pointer',
              ...badgeSize,
            }}
          >
            {label}
          </span>
        );
      })}
      {patternSource &&
        PATTERN_SEMANTIC_TYPE_REF_LIST.filter((r) => patternSource.includes(r[1])).map(
          (typeRef) => {
            const isActive = activeType === typeRef;
            return (
              <span
                key={typeRef}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isActive ? '' : typeRef);
                }}
                className={styles.metadataBadge}
                title={
                  isActive ? `${typeRef} (click to remove)` : `Inherit type from ${typeRef[1]}`
                }
                style={{
                  background: isActive ? '#8b5cf6' : 'transparent',
                  color: isActive ? 'white' : '#8b5cf6',
                  border: isActive ? 'none' : '1px dashed #8b5cf6',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  padding: '1px 3px',
                }}
              >
                {typeRef}
              </span>
            );
          }
        )}
    </div>
  );
};

/** One toggle-button chip per real `SemanticType`, for a multi-select filter-bar
 * (a `Set<SemanticType>` of active types), NOT the per-row single-active-type
 * selector `SemanticTypeToggleCell` above. Renders a bare Fragment — no wrapper
 * div, no label, no "none"/clear-all affordance — so callers compose it into
 * their own flex row alongside whatever else that row needs (a label span, a
 * caller-specific extra option, a shared clear-filters button). Exported so
 * other filter bars (e.g. the Rules tab's type filter) reuse the exact chip
 * styling instead of re-deriving it — see `dictionary/CLAUDE.md`'s reuse note. */
export const SemanticTypeFilterChips: React.FC<{
  // Set<string> (not Set<SemanticType>) — EVDT's filter set also carries the
  // synthetic 'none' value alongside real SemanticTypes; only `.has()` is ever
  // called on it here, so the wider type costs nothing and avoids a cast at
  // that call site.
  activeTypes: Set<string>;
  onToggle: (type: SemanticType) => void;
}> = ({ activeTypes, onToggle }) => (
  <>
    {SEMANTIC_TYPE_LIST.map((type) => (
      <FilterChipButton
        key={type}
        active={activeTypes.has(type)}
        activeColor={SEMANTIC_TYPE_COLORS[type]}
        label={SEMANTIC_TYPE_ABBREVIATIONS[type]}
        onClick={() => onToggle(type)}
        ariaLabel={`Filter by ${SEMANTIC_TYPE_LABELS[type]}`}
        style={{ fontWeight: 600 }}
      />
    ))}
  </>
);

/** Fixed-height flex row shell — the canonical Dictionary row rhythm (`ITEM_HEIGHT`,
 * flex/align-center, bottom-border-only). Exported so any other table-shaped view
 * (e.g. Rules tab, `DuplicateDictionaryTableView`) can reuse the exact same row metrics
 * instead of re-deriving them. `backgroundColor` is an unselected-state override (falls
 * back to `'transparent'`) — added for `DuplicateDictionaryTableView`'s alternating
 * group-background color, which `isSelected`'s own highlight still takes priority over
 * (architecture review 2026-08-28, candidate #2 grilling). */
export const RowShell: React.FC<{
  onContextMenu?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  isScrolling?: boolean;
  backgroundColor?: string;
  role?: string;
  children: React.ReactNode;
}> = ({
  onContextMenu,
  isSelected = false,
  isScrolling = false,
  backgroundColor,
  role,
  children,
}) => (
  <div
    onContextMenu={onContextMenu}
    role={role}
    style={{
      height: ITEM_HEIGHT,
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : (backgroundColor ?? 'transparent'),
      willChange: isScrolling ? 'transform' : 'auto',
    }}
  >
    {children}
  </div>
);

/** Row-selection checkbox cell — identical across all row layouts, no per-type variation.
 * Exported now that `DuplicateDictionaryTableView` is a second real caller (architecture
 * review 2026-08-28, candidate #2 grilling) — the original "add an export only when a second
 * real caller shows up" note was scoped to external (Rules tab) reuse; this is dictionary-
 * internal. `ariaLabel` overrides the default static title/accessible-name for callers that
 * render many rows of this cell at once and need a per-row label to disambiguate them (same
 * reasoning as `SemanticTypeToggleCell`'s `rowLabel`) — omit it to keep this component's own
 * original single-label behavior. */
export const CheckboxCell: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <div className={styles.checkboxCell}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={styles.checkboxInput}
      title="Select for deletion"
      {...(ariaLabel && { 'aria-label': ariaLabel })}
    />
  </div>
);

/** Toggles between the inline `<input>` and a clickable display span. Wrapping div/width/className is the caller's concern. */
const EditableCell: React.FC<{
  edit: InlineFieldEdit;
  renderDisplay: () => React.ReactNode;
}> = ({ edit, renderDisplay }) =>
  edit.editing ? (
    <input
      type="text"
      value={edit.tempValue}
      onChange={(e) => edit.handleChange(e.target.value)}
      onBlur={edit.commitEdit}
      onKeyDown={edit.onKeyDown}
      autoFocus
      className={styles.inlineEditInput}
    />
  ) : (
    <span onClick={edit.startEdit} className={styles.clickableText} title="Click to edit">
      {renderDisplay()}
    </span>
  );

export interface VirtualRowProps {
  source: string;
  translation: DictionaryEntryValue;
  _index: number;
  isScrolling: boolean;
  isSelected: boolean;
  selectedDictionary: string;
  onUpdateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  onSelectEntry: (source: string, isSelected: boolean) => void;
  onContextMenu: (e: React.MouseEvent, source: string, translation: string) => void;
}

export const VirtualRowComponent = React.memo<VirtualRowProps>(
  ({
    source,
    translation,
    _index,
    isScrolling,
    isSelected,
    selectedDictionary,
    onUpdateEntry,
    onSelectEntry,
    onContextMenu,
  }) => {
    const translationText = typeof translation === 'string' ? translation : translation.translation;
    const allowAsPatternVariable =
      typeof translation === 'object' && translation.allowAsPatternVariable === true;
    const semanticType = (typeof translation === 'object' && translation.semanticType) || '';
    const allowedVariableTypes =
      (typeof translation === 'object' && translation.allowedVariableTypes) || {};

    const { isPatterns, isPhrases, isProperNouns } = classifyDictionaryId(selectedDictionary);

    const sourceEdit = useInlineFieldEdit(source, async (newSource) => {
      await onUpdateEntry(
        selectedDictionary,
        source,
        newSource,
        translationText,
        buildEntryMetadata({ allowAsPatternVariable, semanticType, allowedVariableTypes })
      );
    });

    const translEdit = useInlineFieldEdit(translationText, async (newTranslation) => {
      await onUpdateEntry(
        selectedDictionary,
        source,
        source,
        newTranslation,
        buildEntryMetadata({ allowAsPatternVariable, semanticType, allowedVariableTypes })
      );
    });

    const { handleCheckboxChange, handleToggleVariableType, handleSetSemanticType } =
      useEntryMetadataEdit({
        source,
        translationText,
        semanticType,
        allowedVariableTypes,
        allowAsPatternVariable,
        selectedDictionary,
        onUpdateEntry,
      });

    // Patterns layout — see EnhancedVirtualizedDictionaryTable.module.css's "Column widths"
    // comment block for the full column-by-column layout this shares with the header.
    if (isPatterns) {
      const hasX = source.includes('X');
      const hasY = source.includes('Y');
      return (
        <RowShell
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          isSelected={isSelected}
          isScrolling={isScrolling}
        >
          <CheckboxCell
            checked={isSelected}
            onChange={(checked) => onSelectEntry(source, checked)}
          />

          <div className={`${styles.cell} ${styles.patternsSourceCol}`}>
            <EditableCell
              edit={sourceEdit}
              renderDisplay={() => highlightPatternVariables(source)}
            />
          </div>

          <div className={`${styles.cellEditable} ${styles.patternsTranslationCol}`}>
            <EditableCell edit={translEdit} renderDisplay={() => translationText} />
            {!translEdit.editing && (
              <div className={styles.badgeContainer}>
                <MetadataBadge
                  type="variable"
                  active={allowAsPatternVariable}
                  onClick={() =>
                    handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                  }
                />
              </div>
            )}
          </div>

          {allowAsPatternVariable ? (
            <SemanticTypeToggleCell
              activeType={semanticType}
              onSelect={handleSetSemanticType}
              width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
              patternSource={source}
            />
          ) : (
            <div
              style={{
                width: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
                minWidth: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
              }}
            />
          )}

          <TypeToggleCell
            varName="X"
            hasVariable={hasX}
            activeTypes={allowedVariableTypes['X'] || []}
            onToggle={handleToggleVariableType}
          />

          <TypeToggleCell
            varName="Y"
            hasVariable={hasY}
            activeTypes={allowedVariableTypes['Y'] || []}
            onToggle={handleToggleVariableType}
          />
        </RowShell>
      );
    }

    // Phrases layout — see EnhancedVirtualizedDictionaryTable.module.css's "Column widths"
    // comment block for the full column-by-column layout this shares with the header.
    if (isPhrases) {
      return (
        <RowShell
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          isSelected={isSelected}
          isScrolling={isScrolling}
        >
          <CheckboxCell
            checked={isSelected}
            onChange={(checked) => onSelectEntry(source, checked)}
          />

          <div className={`${styles.cell} ${styles.phrasesSourceCol}`}>
            <EditableCell edit={sourceEdit} renderDisplay={() => source} />
          </div>

          <div className={`${styles.cellEditable} ${styles.phrasesTranslationCol}`}>
            <EditableCell edit={translEdit} renderDisplay={() => translationText} />
            {!translEdit.editing && (
              <div className={styles.badgeContainer}>
                <MetadataBadge
                  type="variable"
                  active={allowAsPatternVariable}
                  onClick={() =>
                    handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                  }
                />
              </div>
            )}
          </div>

          {allowAsPatternVariable ? (
            <SemanticTypeToggleCell
              activeType={semanticType}
              onSelect={handleSetSemanticType}
              width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
            />
          ) : (
            <div
              style={{
                width: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
                minWidth: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
              }}
            />
          )}
        </RowShell>
      );
    }

    // Simple dictionaries (characters, properNouns, etc.) — see
    // EnhancedVirtualizedDictionaryTable.module.css's "Column widths" comment block.
    const sourceColClass = isProperNouns ? styles.properNounsSourceCol : styles.simpleSourceCol;
    const translationColClass = isProperNouns
      ? styles.properNounsTranslationCol
      : styles.simpleTranslationCol;

    return (
      <RowShell
        onContextMenu={(e) => onContextMenu(e, source, translationText)}
        isSelected={isSelected}
        isScrolling={isScrolling}
      >
        <CheckboxCell checked={isSelected} onChange={(checked) => onSelectEntry(source, checked)} />

        <div className={`${styles.cell} ${sourceColClass}`}>
          <EditableCell edit={sourceEdit} renderDisplay={() => source} />
        </div>

        <div className={`${styles.cellEditable} ${translationColClass}`}>
          <EditableCell edit={translEdit} renderDisplay={() => translationText} />
        </div>

        {isProperNouns && (
          <SemanticTypeToggleCell
            activeType={semanticType}
            onSelect={handleSetSemanticType}
            width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
          />
        )}
      </RowShell>
    );
  }
);

VirtualRowComponent.displayName = 'VirtualRowComponent';

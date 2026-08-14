import React from 'react';
import { classifyDictionaryId } from '../../utils/dictionary';
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
import { highlightPatternVariables } from '../../utils/text/PatternTextFormatter';

/** Height of each table row in pixels. Exported so the table can compute totalHeight. */
export const ITEM_HEIGHT = 40;

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

const TypeToggleCell: React.FC<{
  varName: string;
  hasVariable: boolean;
  activeTypes: string[];
  onToggle: (varName: string, type: string) => void;
}> = ({ varName, hasVariable, activeTypes, onToggle }) => {
  if (!hasVariable) {
    return (
      <div
        style={{
          width: '13%',
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
      style={{
        width: '13%',
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
    {SEMANTIC_TYPE_LIST.map((type) => {
      const isActive = activeTypes.has(type);
      return (
        <button
          key={type}
          onClick={() => onToggle(type)}
          aria-label={`Filter by ${SEMANTIC_TYPE_LABELS[type]}`}
          style={{
            padding: '0.2rem 0.5rem',
            fontSize: '0.75rem',
            borderRadius: '4px',
            border: `1px solid ${isActive ? SEMANTIC_TYPE_COLORS[type] : 'var(--border-color)'}`,
            cursor: 'pointer',
            backgroundColor: isActive ? SEMANTIC_TYPE_COLORS[type] : 'transparent',
            color: isActive ? 'white' : 'var(--text-color)',
            fontWeight: 600,
          }}
        >
          {SEMANTIC_TYPE_ABBREVIATIONS[type]}
        </button>
      );
    })}
  </>
);

/** Fixed-height flex row shell — the canonical Dictionary row rhythm (`ITEM_HEIGHT`,
 * flex/align-center, bottom-border-only). Exported so any other table-shaped view
 * (e.g. Rules tab) can reuse the exact same row metrics instead of re-deriving them. */
export const RowShell: React.FC<{
  onContextMenu?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  isScrolling?: boolean;
  role?: string;
  children: React.ReactNode;
}> = ({ onContextMenu, isSelected = false, isScrolling = false, role, children }) => (
  <div
    onContextMenu={onContextMenu}
    role={role}
    style={{
      height: ITEM_HEIGHT,
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
      willChange: isScrolling ? 'transform' : 'auto',
    }}
  >
    {children}
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
    const buildTextSaveMetadata = () =>
      isPatterns || isPhrases || isProperNouns
        ? {
            allowAsPatternVariable,
            ...(semanticType && { semanticType }),
            ...(Object.keys(allowedVariableTypes).length > 0 && { allowedVariableTypes }),
          }
        : {};

    const sourceEdit = useInlineFieldEdit(source, async (newSource) => {
      await onUpdateEntry(
        selectedDictionary,
        source,
        newSource,
        translationText,
        buildTextSaveMetadata()
      );
    });

    const translEdit = useInlineFieldEdit(translationText, async (newTranslation) => {
      await onUpdateEntry(
        selectedDictionary,
        source,
        source,
        newTranslation,
        buildTextSaveMetadata()
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

    // Patterns layout: checkbox | source (25%) | translation+badges (34%) | semantic (15%) | X types (13%) | Y types (13%)
    if (isPatterns) {
      const hasX = source.includes('X');
      const hasY = source.includes('Y');
      return (
        <RowShell
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          isSelected={isSelected}
          isScrolling={isScrolling}
        >
          <div className={styles.checkboxCell}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectEntry(source, e.target.checked)}
              className={styles.checkboxInput}
              title="Select for deletion"
            />
          </div>

          <div className={styles.cell} style={{ width: 'calc(25% - 20px)' }}>
            <EditableCell
              edit={sourceEdit}
              renderDisplay={() => highlightPatternVariables(source)}
            />
          </div>

          <div className={styles.cellEditable} style={{ width: '34%' }}>
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
              width="15%"
              patternSource={source}
            />
          ) : (
            <div style={{ width: '15%', minWidth: '15%' }} />
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

    // Phrases layout: 3-column (checkbox | source | translation+VAR badge | semantic)
    if (selectedDictionary === 'phrases') {
      return (
        <RowShell
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          isSelected={isSelected}
          isScrolling={isScrolling}
        >
          <div className={styles.checkboxCell}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectEntry(source, e.target.checked)}
              className={styles.checkboxInput}
              title="Select for deletion"
            />
          </div>

          <div className={styles.cell} style={{ width: 'calc(25% - 20px)' }}>
            <EditableCell edit={sourceEdit} renderDisplay={() => source} />
          </div>

          <div className={styles.cellEditable} style={{ width: 'calc(60% - 20px)' }}>
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
              width="15%"
            />
          ) : (
            <div style={{ width: '15%', minWidth: '15%' }} />
          )}
        </RowShell>
      );
    }

    // Simple dictionaries (characters, properNouns, etc.)
    const isProperNoun = selectedDictionary.startsWith('properNouns');
    const sourceWidth = isProperNoun ? 'calc(25% - 20px)' : 'calc(35% - 20px)';
    const translationWidth = isProperNoun ? 'calc(60% - 20px)' : 'calc(65% - 20px)';

    return (
      <RowShell
        onContextMenu={(e) => onContextMenu(e, source, translationText)}
        isSelected={isSelected}
        isScrolling={isScrolling}
      >
        <div className={styles.checkboxCell}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelectEntry(source, e.target.checked)}
            className={styles.checkboxInput}
            title="Select for deletion"
          />
        </div>

        <div className={styles.cell} style={{ width: sourceWidth }}>
          <EditableCell edit={sourceEdit} renderDisplay={() => source} />
        </div>

        <div className={styles.cellEditable} style={{ width: translationWidth }}>
          <EditableCell edit={translEdit} renderDisplay={() => translationText} />
        </div>

        {isProperNoun && (
          <SemanticTypeToggleCell
            activeType={semanticType}
            onSelect={handleSetSemanticType}
            width="15%"
          />
        )}
      </RowShell>
    );
  }
);

VirtualRowComponent.displayName = 'VirtualRowComponent';

import React from 'react';
import { classifyDictionaryId } from '../../utils/dictionary';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { useEntryMetadataEdit } from '../../hooks/useEntryMetadataEdit';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_LIST,
  PATTERN_SEMANTIC_TYPE_REF_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import type { DictionaryEntryValue } from '../../types/DictionaryTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

/** Height of each table row in pixels. Exported so the table can compute totalHeight. */
export const ITEM_HEIGHT = 40;

const highlightPatternVariables = (text: string): React.ReactNode => {
  const parts = text.split(/([A-Z])/);
  const variableColors: Record<string, string> = {
    X: '#dc2626',
    Y: '#16a34a',
    Z: '#0891b2',
    A: '#ea580c',
    B: '#7c3aed',
    C: '#0d9488',
    D: '#db2777',
    E: '#2563eb',
  };
  return parts.map((part, index) => {
    if (part.length === 1 && /[A-Z]/.test(part)) {
      const color = variableColors[part] || '#059669';
      return (
        <span key={index} className={styles.patternVariable} style={{ color }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

interface BadgeProps {
  type: 'variable' | 'lowPriority';
  active: boolean;
  onClick: () => void;
}

const MetadataBadge: React.FC<BadgeProps> = ({ type, active, onClick }) => {
  const config =
    type === 'variable'
      ? {
          label: 'VAR',
          title: active ? 'Click to disallow as variable' : 'Click to allow as variable',
          activeColor: '#059669',
          inactiveColor: '#6b7280',
        }
      : {
          label: 'LP',
          title: active ? 'Click to remove low priority' : 'Click to set low priority',
          activeColor: '#dc2626',
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
      {active && (type === 'variable' ? '✓ ' : '⬇ ')}
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

const SemanticTypeToggleCell: React.FC<{
  activeType: string;
  onSelect: (type: string) => void;
  width?: string;
  patternSource?: string;
}> = ({ activeType, onSelect, width = '15%', patternSource }) => {
  return (
    <div
      style={{
        width,
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
              onSelect(isActive ? '' : type);
            }}
            className={styles.metadataBadge}
            title={isActive ? `${type} (click to remove)` : `Set as ${type}`}
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
    const lowPriority = typeof translation === 'object' && translation.lowPriority === true;
    const semanticType = (typeof translation === 'object' && translation.semanticType) || '';
    const allowedVariableTypes =
      (typeof translation === 'object' && translation.allowedVariableTypes) || {};

    const { isPatterns, isPhrases, isProperNouns } = classifyDictionaryId(selectedDictionary);
    const buildTextSaveMetadata = () =>
      isPatterns || isPhrases || isProperNouns
        ? {
            allowAsPatternVariable,
            lowPriority,
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
        lowPriority,
        selectedDictionary,
        onUpdateEntry,
      });

    // Patterns layout: checkbox | source (25%) | translation+badges (34%) | semantic (15%) | X types (13%) | Y types (13%)
    if (selectedDictionary === 'patterns') {
      const hasX = source.includes('X');
      const hasY = source.includes('Y');
      return (
        <div
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          style={{
            height: ITEM_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
            willChange: isScrolling ? 'transform' : 'auto',
          }}
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
            {sourceEdit.editing ? (
              <input
                type="text"
                value={sourceEdit.tempValue}
                onChange={(e) => sourceEdit.handleChange(e.target.value)}
                onBlur={sourceEdit.commitEdit}
                onKeyDown={sourceEdit.onKeyDown}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <span
                onClick={sourceEdit.startEdit}
                className={styles.clickableText}
                title="Click to edit"
              >
                {highlightPatternVariables(source)}
              </span>
            )}
          </div>

          <div className={styles.cellEditable} style={{ width: '34%' }}>
            {translEdit.editing ? (
              <input
                type="text"
                value={translEdit.tempValue}
                onChange={(e) => translEdit.handleChange(e.target.value)}
                onBlur={translEdit.commitEdit}
                onKeyDown={translEdit.onKeyDown}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <>
                <span
                  onClick={translEdit.startEdit}
                  className={styles.clickableText}
                  title="Click to edit"
                >
                  {translationText}
                </span>
                <div className={styles.badgeContainer}>
                  <MetadataBadge
                    type="variable"
                    active={allowAsPatternVariable}
                    onClick={() =>
                      handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                    }
                  />
                  <MetadataBadge
                    type="lowPriority"
                    active={lowPriority}
                    onClick={() => handleCheckboxChange('lowPriority', !lowPriority)}
                  />
                </div>
              </>
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
        </div>
      );
    }

    // Phrases layout: 3-column (checkbox | source | translation+VAR badge | semantic)
    if (selectedDictionary === 'phrases') {
      return (
        <div
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          style={{
            height: ITEM_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
            willChange: isScrolling ? 'transform' : 'auto',
          }}
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

          <div
            style={{
              width: 'calc(25% - 20px)',
              padding: '0.25rem 0.75rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sourceEdit.editing ? (
              <input
                type="text"
                value={sourceEdit.tempValue}
                onChange={(e) => sourceEdit.handleChange(e.target.value)}
                onBlur={sourceEdit.commitEdit}
                onKeyDown={sourceEdit.onKeyDown}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <span
                onClick={sourceEdit.startEdit}
                className={styles.clickableText}
                title="Click to edit"
              >
                {source}
              </span>
            )}
          </div>

          <div
            style={{
              width: 'calc(60% - 20px)',
              padding: '0.25rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              overflow: 'hidden',
            }}
          >
            {translEdit.editing ? (
              <input
                type="text"
                value={translEdit.tempValue}
                onChange={(e) => translEdit.handleChange(e.target.value)}
                onBlur={translEdit.commitEdit}
                onKeyDown={translEdit.onKeyDown}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <>
                <span
                  onClick={translEdit.startEdit}
                  className={styles.clickableText}
                  title="Click to edit"
                >
                  {translationText}
                </span>
                <div className={styles.badgeContainer}>
                  <MetadataBadge
                    type="variable"
                    active={allowAsPatternVariable}
                    onClick={() =>
                      handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                    }
                  />
                </div>
              </>
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
        </div>
      );
    }

    // Simple dictionaries (characters, properNouns, etc.)
    const isProperNoun = selectedDictionary.startsWith('properNouns');
    const sourceWidth = isProperNoun ? 'calc(25% - 20px)' : 'calc(35% - 20px)';
    const translationWidth = isProperNoun ? 'calc(60% - 20px)' : 'calc(65% - 20px)';

    return (
      <div
        onContextMenu={(e) => onContextMenu(e, source, translationText)}
        style={{
          height: ITEM_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
          willChange: isScrolling ? 'transform' : 'auto',
        }}
      >
        <div
          style={{
            width: '40px',
            minWidth: '40px',
            maxWidth: '40px',
            padding: '0.25rem 0.75rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelectEntry(source, e.target.checked)}
            style={{ cursor: 'pointer' }}
            title="Select for deletion"
          />
        </div>

        <div className={styles.cell} style={{ width: sourceWidth }}>
          {sourceEdit.editing ? (
            <input
              type="text"
              value={sourceEdit.tempValue}
              onChange={(e) => sourceEdit.handleChange(e.target.value)}
              onBlur={sourceEdit.commitEdit}
              onKeyDown={sourceEdit.onKeyDown}
              autoFocus
              style={{
                width: '100%',
                border: '1px solid var(--accent-color)',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                backgroundColor: 'var(--background-color)',
                color: 'var(--text-color)',
              }}
            />
          ) : (
            <span
              onClick={sourceEdit.startEdit}
              style={{
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to edit"
            >
              {source}
            </span>
          )}
        </div>

        <div
          className={styles.cell}
          style={{
            width: translationWidth,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            overflow: 'hidden',
          }}
        >
          {translEdit.editing ? (
            <input
              type="text"
              value={translEdit.tempValue}
              onChange={(e) => translEdit.handleChange(e.target.value)}
              onBlur={translEdit.commitEdit}
              onKeyDown={translEdit.onKeyDown}
              autoFocus
              style={{
                width: '100%',
                border: '1px solid var(--accent-color)',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                backgroundColor: 'var(--background-color)',
                color: 'var(--text-color)',
              }}
            />
          ) : (
            <span
              onClick={translEdit.startEdit}
              style={{
                cursor: 'pointer',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to edit"
            >
              {translationText}
            </span>
          )}
        </div>

        {isProperNoun && (
          <SemanticTypeToggleCell
            activeType={semanticType}
            onSelect={handleSetSemanticType}
            width="15%"
          />
        )}
      </div>
    );
  }
);

VirtualRowComponent.displayName = 'VirtualRowComponent';

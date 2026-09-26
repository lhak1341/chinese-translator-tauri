import React from 'react';
import {
  isPatternsDict,
  isPhrasesDict,
  isProperNounsDict,
  buildEntryMetadata,
  entryFields,
  toggleVariableType,
} from '../../utils/dictionary';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import type { InlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { logger } from '../../utils/logger';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_LIST,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import type { DictionaryEntryValue, DictionaryContextInterface } from '../../types/DictionaryTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { highlightPatternVariables } from '../../utils/text';
import {
  RowShell,
  CheckboxCell,
  MetadataBadge,
  SemanticTypeToggleCell,
  BadgeChip,
} from './TableBuildingBlocks';

/** Width of the per-row Semantic-type column (patterns/phrases/properNouns). Shared constant
 * rather than a CSS class because `SemanticTypeToggleCell`'s width is a JS prop — it's reused
 * outside Dictionary (Rules tab) with its own widths, so the column-width mechanism here can't
 * be a className the way Source/Translation are (architecture review 2026-08-28, candidate #2
 * grilling). */
export const DICTIONARY_SEMANTIC_COLUMN_WIDTH = '15%';

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
        return (
          <BadgeChip
            key={type}
            label={SEMANTIC_TYPE_ABBREVIATIONS[type]}
            active={isActive}
            activeColor={SEMANTIC_TYPE_COLORS[type as SemanticType]}
            onClick={() => onToggle(varName, type)}
            title={`${isActive ? 'Remove' : 'Add'} ${type} for ${varName}`}
          />
        );
      })}
    </div>
  );
};

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
  isSelected: boolean;
  selectedDictionary: string;
  /** Only for a source rename, which re-keys the entry; every other edit is `onPatchEntry`. */
  onUpdateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  /** Changes some fields of this entry; the rest is read from the store, not these props. */
  onPatchEntry: DictionaryContextInterface['patchEntry'];
  onSelectEntry: (source: string, isSelected: boolean) => void;
  onContextMenu: (
    e: React.MouseEvent,
    source: string,
    translation: string,
    dictionaryId: string
  ) => void;
}

export const VirtualRowComponent = React.memo<VirtualRowProps>(
  ({
    source,
    translation,
    isSelected,
    selectedDictionary,
    onUpdateEntry,
    onPatchEntry,
    onSelectEntry,
    onContextMenu,
  }) => {
    const {
      translation: translationText,
      allowAsPatternVariable,
      semanticType,
      allowedVariableTypes,
    } = entryFields(translation);

    const isPatterns = isPatternsDict(selectedDictionary);
    const isPhrases = isPhrasesDict(selectedDictionary);
    const isProperNouns = isProperNounsDict(selectedDictionary);

    const sourceEdit = useInlineFieldEdit(source, async (newSource) => {
      await onUpdateEntry(
        selectedDictionary,
        source,
        newSource,
        translationText,
        buildEntryMetadata({ allowAsPatternVariable, semanticType, allowedVariableTypes })
      );
    });

    const translEdit = useInlineFieldEdit(translationText, (newTranslation) =>
      onPatchEntry(selectedDictionary, source, { translation: newTranslation })
    );

    // onPatchEntry toasts its own failures; the catch only keeps the rejection handled.
    const patch = (fields: Parameters<VirtualRowProps['onPatchEntry']>[2]): void => {
      onPatchEntry(selectedDictionary, source, fields).catch((error: unknown) =>
        logger.error('Failed to update entry:', error)
      );
    };
    const setAllowAsPatternVariable = (value: boolean): void =>
      patch({ allowAsPatternVariable: value });
    const handleSetSemanticType = (value: string): void => patch({ semanticType: value });
    const handleToggleVariableType = (varName: string, type: string): void =>
      patch((current) => ({
        allowedVariableTypes: toggleVariableType(current.allowedVariableTypes, varName, type),
      }));

    // Patterns layout — see EnhancedVirtualizedDictionaryTable.module.css's "Column widths"
    // comment block for the full column-by-column layout this shares with the header.
    if (isPatterns) {
      const hasX = source.includes('X');
      const hasY = source.includes('Y');
      return (
        <RowShell
          onContextMenu={(e) => onContextMenu(e, source, translationText, selectedDictionary)}
          isSelected={isSelected}
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
                  onClick={() => setAllowAsPatternVariable(!allowAsPatternVariable)}
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
          onContextMenu={(e) => onContextMenu(e, source, translationText, selectedDictionary)}
          isSelected={isSelected}
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
                  onClick={() => setAllowAsPatternVariable(!allowAsPatternVariable)}
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
        onContextMenu={(e) => onContextMenu(e, source, translationText, selectedDictionary)}
        isSelected={isSelected}
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

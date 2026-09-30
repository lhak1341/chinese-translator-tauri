import React from 'react';
import {
  isPatternsDict,
  isPhrasesDict,
  isProperNounsDict,
  entryFields,
  toggleVariableType,
} from '../../utils/dictionary';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import type { DictionaryEntryValue, DictionaryContextInterface } from '../../types/DictionaryTypes';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { highlightPatternVariables } from '../../utils/text';
import { RowShell, CheckboxCell } from './TableBuildingBlocks';
import { ControlledEditableCell } from '../EditableCell';
import { EntryVarCell, EntrySemanticCell, EntryTypeCells, entryPatcher } from './EntryCells';

/** Width of the per-row Semantic-type column (patterns/phrases/properNouns). Shared constant
 * rather than a CSS class because `SemanticTypeToggleCell`'s width is a JS prop — it's reused
 * outside Dictionary (Rules tab) with its own widths, so the column-width mechanism here can't
 * be a className the way Source/Translation are (architecture review 2026-08-28, candidate #2
 * grilling). */
export const DICTIONARY_SEMANTIC_COLUMN_WIDTH = '15%';

/** Each kind's Source/Translation column classes — layout only; see
 * EnhancedVirtualizedDictionaryTable.module.css's "Column widths" comment block, which this
 * shares with the header. What else a row shows comes from `EntryCells`. */
function columnClasses(dictionaryId: string): { source: string; translation: string } {
  if (isPatternsDict(dictionaryId)) {
    return { source: styles.patternsSourceCol, translation: styles.patternsTranslationCol };
  }
  if (isPhrasesDict(dictionaryId)) {
    return { source: styles.phrasesSourceCol, translation: styles.phrasesTranslationCol };
  }
  if (isProperNounsDict(dictionaryId)) {
    return { source: styles.properNounsSourceCol, translation: styles.properNounsTranslationCol };
  }
  return { source: styles.simpleSourceCol, translation: styles.simpleTranslationCol };
}

export interface VirtualRowProps {
  source: string;
  translation: DictionaryEntryValue;
  isSelected: boolean;
  selectedDictionary: string;
  /** A source rename, which re-keys the entry. It reads the other fields from the store as the
   * commit runs, so the row passes none (every other edit is `onPatchEntry`). */
  onRenameEntry: DictionaryContextInterface['renameEntry'];
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
    onRenameEntry,
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

    const sourceEdit = useInlineFieldEdit(source, (newSource) =>
      onRenameEntry(selectedDictionary, source, newSource)
    );

    const translEdit = useInlineFieldEdit(translationText, (newTranslation) =>
      onPatchEntry(selectedDictionary, source, { translation: newTranslation })
    );

    const patch = entryPatcher(onPatchEntry, selectedDictionary, source);
    const columns = columnClasses(selectedDictionary);

    return (
      <RowShell
        onContextMenu={(e) => onContextMenu(e, source, translationText, selectedDictionary)}
        isSelected={isSelected}
      >
        <CheckboxCell checked={isSelected} onChange={(checked) => onSelectEntry(source, checked)} />

        <div className={`${styles.cell} ${columns.source}`}>
          <ControlledEditableCell
            edit={sourceEdit}
            value={source}
            label={`Source for ${source}`}
            display={
              isPatternsDict(selectedDictionary) ? highlightPatternVariables(source) : undefined
            }
            inputClassName={styles.inlineEditInput}
            spanClassName={styles.clickableText}
          />
        </div>

        <div className={`${styles.cellEditable} ${columns.translation}`}>
          <ControlledEditableCell
            edit={translEdit}
            value={translationText}
            label={`Translation for ${source}`}
            inputClassName={styles.inlineEditInput}
            spanClassName={styles.clickableText}
          />
          {!translEdit.editing && (
            // One dictionary per table: every row's VAR works the same way.
            <EntryVarCell
              dictionaryId={selectedDictionary}
              active={allowAsPatternVariable}
              onToggle={() => patch({ allowAsPatternVariable: !allowAsPatternVariable })}
              mixedKinds={false}
            />
          )}
        </div>

        <EntrySemanticCell
          dictionaryId={selectedDictionary}
          source={source}
          allowAsPatternVariable={allowAsPatternVariable}
          semanticType={semanticType}
          onSelect={(value) => patch({ semanticType: value })}
          width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
        />

        <EntryTypeCells
          dictionaryId={selectedDictionary}
          source={source}
          allowedVariableTypes={allowedVariableTypes}
          onToggle={(varName, type) =>
            patch((current) => ({
              allowedVariableTypes: toggleVariableType(current.allowedVariableTypes, varName, type),
            }))
          }
        />
      </RowShell>
    );
  }
);

VirtualRowComponent.displayName = 'VirtualRowComponent';

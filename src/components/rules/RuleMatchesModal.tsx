import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from '../../styles/RuleMatchesModal.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { RowShell, MetadataBadge, SemanticTypeToggleCell } from '../dictionary/TableBuildingBlocks';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { ControlledEditableCell } from './EditableCell';
import { useEntryMetadataEdit } from '../../hooks/useEntryMetadataEdit';
import { findRuleMatchingEntries } from '../../utils/dictionary/TransformRuleEngine';
import type { RuleMatchEntry } from '../../utils/dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { DictionaryData } from '../../types/DictionaryTypes';

type OnUpdateEntry = (
  dictionaryId: string,
  oldSource: string,
  newSource: string,
  translation: string,
  metadata?: Record<string, unknown>
) => Promise<void>;

interface RuleMatchesModalProps {
  rule: TransformRule;
  dictionaries: Record<string, DictionaryData>;
  updateEntry: OnUpdateEntry;
  onClose: () => void;
}

/** properNouns entries are always usable as variables — unlike phrases, where it's a
 * real per-entry toggle. Same badge look, but not clickable, with a title explaining why
 * instead of MetadataBadge's own (wrong, for this case) "click to disallow" tooltip. */
function VarBadge({
  dictionaryId,
  active,
  onToggle,
}: {
  dictionaryId: string;
  active: boolean;
  onToggle: () => void;
}) {
  if (dictionaryId.startsWith('properNouns')) {
    return (
      <span
        className={dictStyles.metadataBadge}
        title="Proper noun entries are always usable as variables — not toggleable here"
        style={{ background: '#059669', color: 'white', border: 'none', cursor: 'default' }}
      >
        ✓ VAR
      </span>
    );
  }
  return <MetadataBadge type="variable" active={active} onClick={onToggle} />;
}

function MatchRow({ row, updateEntry }: { row: RuleMatchEntry; updateEntry: OnUpdateEntry }) {
  const isProperNoun = row.dictionaryId.startsWith('properNouns');

  const commitTranslation = async (newTranslation: string): Promise<void> => {
    await updateEntry(row.dictionaryId, row.source, row.source, newTranslation, {
      allowAsPatternVariable: row.allowAsPatternVariable,
      ...(row.semanticType && { semanticType: row.semanticType }),
      ...(Object.keys(row.allowedVariableTypes).length > 0 && {
        allowedVariableTypes: row.allowedVariableTypes,
      }),
    });
  };
  const translEdit = useInlineFieldEdit(row.translation, commitTranslation);

  const { handleCheckboxChange, handleSetSemanticType } = useEntryMetadataEdit({
    source: row.source,
    translationText: row.translation,
    semanticType: row.semanticType,
    allowedVariableTypes: row.allowedVariableTypes,
    allowAsPatternVariable: row.allowAsPatternVariable,
    selectedDictionary: row.dictionaryId,
    onUpdateEntry: updateEntry,
  });

  // Matches Dictionary's own phrases-row rule: Semantic is only settable once VAR is on
  // (for phrases). properNouns rows show it unconditionally, same as Dictionary's own.
  const showSemantic = isProperNoun || row.allowAsPatternVariable;

  return (
    <RowShell role="row">
      <div role="cell" className={`${dictStyles.cell} ${styles.colSource}`}>
        {row.source}
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colTranslation}`}>
        <ControlledEditableCell
          value={row.translation}
          label={`Translation for ${row.source}`}
          edit={translEdit}
          inputClassName={dictStyles.inlineEditInput}
          spanClassName={dictStyles.clickableText}
        />
        {!translEdit.editing && (
          <div className={dictStyles.badgeContainer}>
            <VarBadge
              dictionaryId={row.dictionaryId}
              active={row.allowAsPatternVariable}
              onToggle={() =>
                handleCheckboxChange('allowAsPatternVariable', !row.allowAsPatternVariable)
              }
            />
          </div>
        )}
      </div>
      <div role="cell" className={styles.colSemantic}>
        {showSemantic ? (
          <SemanticTypeToggleCell
            activeType={row.semanticType}
            onSelect={handleSetSemanticType}
            width="100%"
          />
        ) : null}
      </div>
      <div
        role="cell"
        className={`${dictStyles.cell} ${styles.colDictionary} ${styles.dictionaryValue}`}
      >
        {row.dictionaryLabel}
      </div>
    </RowShell>
  );
}

/** Fullscreen preview of every dictionary entry a Transform Rule matches, across all
 * dictionaries it applies to — same table shape as Dictionary's phrases table (Source /
 * Translation+VAR / Semantic), plus a Dictionary column (like Dictionary's own Find
 * Duplicates view). Translation/VAR/Semantic are live-editable, wired to the same
 * updateEntry the Dictionary tab itself uses. */
const RuleMatchesModal: React.FC<RuleMatchesModalProps> = ({
  rule,
  dictionaries,
  updateEntry,
  onClose,
}) => {
  const matches = useMemo(() => findRuleMatchingEntries(rule, dictionaries), [rule, dictionaries]);

  return (
    <div className={styles.fullscreen}>
      <div className={styles.header}>
        <button className={`secondary ${dmStyles.button}`} onClick={onClose}>
          <ArrowLeft size={15} />
          Back to Rules
        </button>
        <h3 className={styles.title}>
          Matches for {rule.matchKind} &quot;{rule.key}&quot;
          <span className={styles.count}> ({matches.length})</span>
        </h3>
      </div>

      {matches.length === 0 ? (
        <div className={styles.empty}>No dictionary entries match this rule yet.</div>
      ) : (
        <div className={styles.tableArea}>
          <div className={styles.table} role="table">
            <div role="row" className={styles.headerRow}>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colSource}`}>
                Source
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colTranslation}`}>
                Translation
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colSemantic}`}>
                Semantic
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colDictionary}`}>
                Dictionary
              </div>
            </div>
            <div role="rowgroup">
              {matches.map((row) => (
                <MatchRow
                  key={`${row.dictionaryId}::${row.source}`}
                  row={row}
                  updateEntry={updateEntry}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RuleMatchesModal;

import { isProperNounsDict } from '../../utils/dictionary';
import React, { useMemo, useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from '../../styles/RuleMatchesModal.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { RowShell, MetadataBadge, SemanticTypeToggleCell } from '../dictionary/TableBuildingBlocks';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { ControlledEditableCell } from './EditableCell';
import EntryContextMenu from '../dictionary/EntryContextMenu';
import MoveDialog from '../dictionary/MoveDialog';
import { useContextMenu, type ContextMenuEntry } from '../../hooks/useContextMenu';
import { logger } from '../../utils/logger';
import { findRuleMatchingEntries } from '../../utils/dictionary/TransformRuleEngine';
import type { RuleMatchEntry } from '../../utils/dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { DictionaryData, DictionaryContextInterface } from '../../types/DictionaryTypes';

type PatchEntry = DictionaryContextInterface['patchEntry'];

interface RuleMatchesModalProps {
  rule: TransformRule;
  dictionaries: Record<string, DictionaryData>;
  /** The Dictionary tab's own `patchEntry`: each inline edit changes one field, and the rest
   * of the entry is read from the store, not from this row. */
  patchEntry: PatchEntry;
  /** Right-click → Delete. Same `deleteEntry` the Dictionary tab uses (it owns the toast). */
  deleteEntry: (dictionaryId: string, source: string) => Promise<void>;
  onClose: () => void;
}

type OnRowContextMenu = (
  e: React.MouseEvent,
  source: string,
  translation: string,
  dictionaryId: string
) => void;

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
  if (isProperNounsDict(dictionaryId)) {
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

function MatchRow({
  row,
  patchEntry,
  onContextMenu,
}: {
  row: RuleMatchEntry;
  patchEntry: PatchEntry;
  onContextMenu: OnRowContextMenu;
}) {
  const isProperNoun = isProperNounsDict(row.dictionaryId);

  const translEdit = useInlineFieldEdit(row.translation, (translation) =>
    patchEntry(row.dictionaryId, row.source, { translation })
  );
  // patchEntry toasts its own failures; the catch only keeps the rejection handled.
  const patch = (fields: Parameters<PatchEntry>[2]): void => {
    patchEntry(row.dictionaryId, row.source, fields).catch((error: unknown) =>
      logger.error('Failed to update entry:', error)
    );
  };

  // Matches Dictionary's own phrases-row rule: Semantic is only settable once VAR is on
  // (for phrases). properNouns rows show it unconditionally, same as Dictionary's own.
  const showSemantic = isProperNoun || row.allowAsPatternVariable;

  return (
    <RowShell
      role="row"
      onContextMenu={(e) => onContextMenu(e, row.source, row.translation, row.dictionaryId)}
    >
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
              onToggle={() => patch({ allowAsPatternVariable: !row.allowAsPatternVariable })}
            />
          </div>
        )}
      </div>
      <div role="cell" className={styles.colSemantic}>
        {showSemantic ? (
          <SemanticTypeToggleCell
            activeType={row.semanticType}
            onSelect={(semanticType) => patch({ semanticType })}
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
 * patchEntry the Dictionary tab itself uses. */
const RuleMatchesModal: React.FC<RuleMatchesModalProps> = ({
  rule,
  dictionaries,
  patchEntry,
  deleteEntry,
  onClose,
}) => {
  const matches = useMemo(() => findRuleMatchingEntries(rule, dictionaries), [rule, dictionaries]);

  // Right-click Move to... / Delete — the Dictionary tab's own menu and MoveDialog. No Edit
  // item: every editable field here is already edited inline. A moved or deleted entry drops
  // out of `matches` on its own, since the list is derived from live `dictionaries`.
  const [moveEntry, setMoveEntry] = useState<ContextMenuEntry | null>(null);
  const onDelete = useCallback(
    (entry: ContextMenuEntry) => deleteEntry(entry.dictionaryId, entry.source),
    [deleteEntry]
  );
  const contextMenuApi = useContextMenu({
    onEdit: () => {},
    onMove: setMoveEntry,
    onDelete,
  });

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
                  patchEntry={patchEntry}
                  onContextMenu={contextMenuApi.handleContextMenu}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <EntryContextMenu menu={contextMenuApi} showEdit={false} />

      {moveEntry && (
        <MoveDialog
          entries={[moveEntry.source]}
          currentDictionary={moveEntry.dictionaryId}
          onClose={() => setMoveEntry(null)}
        />
      )}
    </div>
  );
};

export default RuleMatchesModal;

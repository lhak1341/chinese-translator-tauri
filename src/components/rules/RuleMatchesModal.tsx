import React, { useMemo, useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell } from '@lhak/style/react';
import styles from '../../styles/RuleMatchesModal.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { RowShell } from '../dictionary/TableBuildingBlocks';
import { EntryVarCell, EntrySemanticCell, entryPatcher } from '../dictionary/EntryCells';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import { ControlledEditableCell } from '../EditableCell';
import EntryContextMenu from '../dictionary/EntryContextMenu';
import MoveDialog from '../dictionary/MoveDialog';
import {
  useContextMenu,
  type ContextMenuEntry,
  type OpenEntryMenu,
} from '../../hooks/useContextMenu';
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
  /** Right-click → Delete. Same `bulkDeleteEntries` the Dictionary tab uses (it owns the toast). */
  bulkDeleteEntries: DictionaryContextInterface['bulkDeleteEntries'];
  onClose: () => void;
}

type OnRowContextMenu = OpenEntryMenu;

function MatchRow({
  row,
  patchEntry,
  onContextMenu,
  index,
}: {
  row: RuleMatchEntry;
  patchEntry: PatchEntry;
  onContextMenu: OnRowContextMenu;
  index: number;
}) {
  const translEdit = useInlineFieldEdit(row.translation, (translation) =>
    patchEntry(row.dictionaryId, row.source, { translation })
  );
  const patch = entryPatcher(patchEntry, row.dictionaryId, row.source);

  return (
    <RowShell
      index={index}
      onContextMenu={() => onContextMenu(row.source, row.translation, row.dictionaryId)}
    >
      <TableCell lang="zh" className={`${dictStyles.cell} ${styles.colSource} lk-face-chinese`}>
        {row.source}
      </TableCell>
      <TableCell className={`${dictStyles.cellEditable} ${styles.colTranslation}`}>
        <ControlledEditableCell
          value={row.translation}
          label={`Translation for ${row.source}`}
          edit={translEdit}
          inputClassName={dictStyles.inlineEditInput}
          spanClassName={dictStyles.clickableText}
        />
        {!translEdit.editing && (
          // A rule's matches span dictionaries, so a proper noun's always-on VAR is shown.
          <EntryVarCell
            dictionaryId={row.dictionaryId}
            active={row.allowAsPatternVariable}
            onToggle={() => patch({ allowAsPatternVariable: !row.allowAsPatternVariable })}
            mixedKinds
          />
        )}
      </TableCell>
      <TableCell className={styles.colSemantic}>
        <EntrySemanticCell
          dictionaryId={row.dictionaryId}
          source={row.source}
          allowAsPatternVariable={row.allowAsPatternVariable}
          semanticType={row.semanticType}
          onSelect={(semanticType) => patch({ semanticType })}
          width="100%"
        />
      </TableCell>
      <TableCell className={`${dictStyles.cell} ${styles.colDictionary} ${styles.dictionaryValue}`}>
        {row.dictionaryLabel}
      </TableCell>
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
  bulkDeleteEntries,
  onClose,
}) => {
  const matches = useMemo(() => findRuleMatchingEntries(rule, dictionaries), [rule, dictionaries]);

  // Right-click Move to... / Delete — the Dictionary tab's own menu and MoveDialog. No Edit
  // item: every editable field here is already edited inline. A moved or deleted entry drops
  // out of `matches` on its own, since the list is derived from live `dictionaries`.
  const [moveEntry, setMoveEntry] = useState<ContextMenuEntry | null>(null);
  const onDelete = useCallback(
    async (entry: ContextMenuEntry) => {
      await bulkDeleteEntries([{ dictionaryId: entry.dictionaryId, key: entry.source }]);
    },
    [bulkDeleteEntries]
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
          <Table
            aria-label="Matching entries"
            rowCount={matches.length + 1}
            className={styles.table}
          >
            <TableHeader>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colSource}`}>
                Source
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colTranslation}`}>
                Translation
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colSemantic}`}>
                Semantic
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colDictionary}`}>
                Dictionary
              </TableHeaderCell>
            </TableHeader>
            <EntryContextMenu menu={contextMenuApi} body={<TableBody />} showEdit={false}>
              {matches.map((row, index) => (
                <MatchRow
                  key={`${row.dictionaryId}::${row.source}`}
                  row={row}
                  patchEntry={patchEntry}
                  index={index}
                  onContextMenu={contextMenuApi.handleContextMenu}
                />
              ))}
            </EntryContextMenu>
          </Table>
        </div>
      )}

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

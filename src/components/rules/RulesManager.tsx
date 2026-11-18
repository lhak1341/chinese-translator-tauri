import { memo, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { PlusCircle } from 'lucide-react';
import { Table, TableHeader, TableHeaderCell } from '@lhak/style/react';
import styles from '../../styles/RulesManager.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { useDictionary } from '../dictionary/DictionaryContext';
import { ITEM_HEIGHT, SemanticTypeFilterChips } from '../dictionary/TableBuildingBlocks';
import { VirtualTableBody } from '../dictionary/VirtualTableBody';
import { useVirtualScrollRange } from '../../hooks/useVirtualScrollRange';
import { SearchFilterHeader, FilterPanel, FilterDimensionRow } from '../SearchFilterHeader';
import { toggled } from '../../utils/ui/toggled';
import RuleMatchesModal from './RuleMatchesModal';
import NewRuleModal from './NewRuleModal';
import RuleRow from './RuleRow';
import { useTransformRuleEditor } from '../../hooks/useTransformRules';
import {
  compareRulePrecedence,
  deriveCapitalizeExceptNForKeyEdit,
} from '../../utils/dictionary/TransformRuleEngine';
import {
  commitRuleDraft,
  draftAsRule,
  extractHanChars,
} from '../../utils/dictionary/TransformRuleValidation';
import type { TransformRule } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import type { SemanticType } from '../../constants/SemanticTypes';

/** Imperative handle so callers outside this component's own tree (e.g. the Cmd-7
 * hotkey, wired in TabbedInterface.tsx) can open the new-rule form — RulesManager is
 * always mounted (tabs stay in the DOM, just hidden via CSS), so this works even when
 * the Rules tab isn't the visible one at press time. Mirrors the `dictionarySearchRef`
 * imperative-ref precedent TabbedInterface.tsx already uses for Dictionary's search. */
export interface RulesManagerHandle {
  openNew: (prefillText?: string) => void;
}

const EMPTY_DRAFT: Omit<TransformRule, 'id'> = {
  matchKind: 'suffix',
  key: '',
  relocate: false,
  moveReplacement: undefined,
  capitalizeExceptN: 0,
  semanticType: 'location',
  enabled: true,
  label: '',
};

const RulesManager = forwardRef<RulesManagerHandle>((_props, ref) => {
  const { rules, isLoading, checkConflict, addRule, updateRule, deleteRule, toggleEnabled } =
    useTransformRuleEditor();
  const { dictionaries, patchEntry, bulkDeleteEntries } = useDictionary();
  const [draft, setDraft] = useState<Omit<TransformRule, 'id'> | null>(null);
  const [viewingMatches, setViewingMatches] = useState<TransformRule | null>(null);

  const conflict = draft ? checkConflict(draftAsRule(draft)) : undefined;
  const conflictLabel = conflict ? conflict.label || conflict.key : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<SemanticType>>(new Set());
  const toggleSemanticTypeFilter = (type: SemanticType) => {
    setFilterSemanticTypes((prev) => toggled(prev, type));
  };

  const sortedRules = useMemo(() => [...rules].sort(compareRulePrecedence), [rules]);
  const filteredRules = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedRules.filter((rule) => {
      const matchesSearch =
        !term ||
        rule.key.toLowerCase().includes(term) ||
        (rule.label ?? '').toLowerCase().includes(term) ||
        (rule.moveReplacement ?? '').toLowerCase().includes(term);
      const matchesType =
        filterSemanticTypes.size === 0 || filterSemanticTypes.has(rule.semanticType);
      return matchesSearch && matchesType;
    });
  }, [sortedRules, searchTerm, filterSemanticTypes]);

  // Only the rows in view are rendered. The tab stays mounted, and every row of a 545-rule
  // list was ~22k DOM nodes WebKit had to draw each time the tab was shown. A new search or
  // type filter starts at the top.
  const scroll = useVirtualScrollRange(filteredRules.length, {
    itemHeight: ITEM_HEIGHT,
    resetKey: `${searchTerm}\u0000${[...filterSemanticTypes].sort().join(',')}`,
  });

  const openNew = (prefillText?: string) => {
    if (!prefillText) {
      setDraft({ ...EMPTY_DRAFT });
      return;
    }
    // Key is capped at MAX_TRANSFORM_RULE_KEY_LENGTH Chinese characters (see
    // TransformRuleTypes.ts) — extractHanChars skips any non-Han chars in the
    // prefill text (e.g. a selected English discourse marker) rather than
    // truncating blindly, so the draft key is never handed to the user already
    // out-of-contract.
    const key = extractHanChars(prefillText, MAX_TRANSFORM_RULE_KEY_LENGTH);
    setDraft({
      ...EMPTY_DRAFT,
      key,
      capitalizeExceptN: deriveCapitalizeExceptNForKeyEdit('', key, EMPTY_DRAFT.capitalizeExceptN),
    });
  };

  useImperativeHandle(ref, () => ({ openNew }));

  const closeModal = () => setDraft(null);

  const save = async () => {
    const rule = draft && commitRuleDraft(draft);
    if (!rule || conflictLabel) return;
    try {
      await addRule(rule);
      setDraft(null);
    } catch {
      // addRule already toasts the reason; leave the modal open to adjust and retry.
    }
  };

  if (isLoading) {
    return <div className={`${styles.container} ${styles.loadingContainer}`}>Loading rules…</div>;
  }

  return (
    <div className={styles.container}>
      <SearchFilterHeader
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search rules..."
        searchAriaLabel="Search rules"
        showFilterButton
        filterOpen={showFilterPanel}
        filterActive={filterSemanticTypes.size > 0}
        onToggleFilter={() => setShowFilterPanel((v) => !v)}
        filterButtonLabel="Filter by semantic type"
        trailingActions={
          <button
            className={`primary ${dmStyles.button}`}
            onClick={() => openNew()}
            title="Add new rule"
          >
            <PlusCircle size={15} />
            Add Rule
          </button>
        }
      />

      <FilterPanel open={showFilterPanel}>
        <FilterDimensionRow label="Type:">
          <SemanticTypeFilterChips
            activeTypes={filterSemanticTypes}
            onToggle={toggleSemanticTypeFilter}
          />
        </FilterDimensionRow>
      </FilterPanel>

      <div className={styles.tableArea}>
        {filteredRules.length === 0 ? (
          <div className={styles.empty}>
            {searchTerm && filterSemanticTypes.size > 0
              ? `No rules matching "${searchTerm}" with the selected type filter`
              : searchTerm
                ? `No rules matching "${searchTerm}"`
                : filterSemanticTypes.size > 0
                  ? 'No rules match the selected type filter'
                  : 'No rules yet — add one to auto-transform matching dictionary entries.'}
          </div>
        ) : (
          <Table
            aria-label="Transform rules"
            rowCount={filteredRules.length + 1}
            className={styles.table}
          >
            <TableHeader>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colOn}`}>
                On
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colMatch}`}>
                Match
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colKey}`}>
                Key
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colChars}`}>
                Chars
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colMove}`}>
                Move
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colCap}`}>
                Cap
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colReplace}`}>
                Replace
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colType}`}>
                Type
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colLabel}`}>
                Label
              </TableHeaderCell>
              <TableHeaderCell className={`${styles.headerCell} ${styles.colActions}`} />
            </TableHeader>
            <VirtualTableBody
              scroll={scroll}
              items={filteredRules}
              getKey={(rule) => rule.id}
              renderRow={(rule, index) => (
                <RuleRow
                  rule={rule}
                  updateRule={updateRule}
                  deleteRule={deleteRule}
                  toggleEnabled={toggleEnabled}
                  onViewMatches={setViewingMatches}
                  index={index}
                />
              )}
              className={styles.rowScroller}
            />
          </Table>
        )}
      </div>

      {draft && (
        <NewRuleModal
          draft={draft}
          setDraft={setDraft}
          conflictLabel={conflictLabel}
          onSave={save}
          onCancel={closeModal}
          dictionaries={dictionaries}
          rules={rules}
        />
      )}

      {viewingMatches && (
        <RuleMatchesModal
          rule={viewingMatches}
          dictionaries={dictionaries}
          patchEntry={patchEntry}
          bulkDeleteEntries={bulkDeleteEntries}
          onClose={() => setViewingMatches(null)}
        />
      )}
    </div>
  );
});

RulesManager.displayName = 'RulesManager';

// Memoized: every tab stays mounted, so without it each tab switch re-renders this tab too.
export default memo(RulesManager);

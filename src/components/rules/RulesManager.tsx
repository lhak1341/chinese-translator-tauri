import { useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { PlusCircle } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { useDictionary } from '../dictionary/DictionaryContext';
import { SemanticTypeFilterChips } from '../dictionary/VirtualRowComponent';
import { SearchFilterHeader, FilterPanel } from '../SearchFilterHeader';
import RuleMatchesModal from './RuleMatchesModal';
import NewRuleModal from './NewRuleModal';
import RuleRow from './RuleRow';
import { useTransformRules } from '../../hooks/useTransformRules';
import {
  compareRulePrecedence,
  deriveCapitalizeExceptNForKeyEdit,
} from '../../utils/dictionary/TransformRuleEngine';
import { extractHanChars } from './RuleFieldValidation';
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
    useTransformRules();
  const { dictionaries, updateEntry } = useDictionary();
  const [draft, setDraft] = useState<Omit<TransformRule, 'id'> | null>(null);
  const [viewingMatches, setViewingMatches] = useState<TransformRule | null>(null);

  const conflict = draft
    ? checkConflict({ id: '__new__', matchKind: draft.matchKind, key: draft.key })
    : undefined;
  const conflictLabel = conflict ? conflict.label || conflict.key : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<SemanticType>>(new Set());
  const toggleSemanticTypeFilter = (type: SemanticType) => {
    setFilterSemanticTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
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
    if (!draft || !draft.key || conflictLabel) return;
    try {
      await addRule(draft);
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
        <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
          Type:
        </span>
        <SemanticTypeFilterChips
          activeTypes={filterSemanticTypes}
          onToggle={toggleSemanticTypeFilter}
        />
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
          <div className={styles.table} role="table">
            <div role="row" className={styles.headerRow}>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colOn}`}>
                On
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colMatch}`}>
                Match
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colKey}`}>
                Key
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colChars}`}>
                Chars
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colMove}`}>
                Move
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colCap}`}>
                Cap
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colReplace}`}>
                Replace
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colType}`}>
                Type
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colLabel}`}>
                Label
              </div>
              <div role="columnheader" className={`${styles.headerCell} ${styles.colActions}`} />
            </div>
            <div role="rowgroup">
              {filteredRules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  updateRule={updateRule}
                  deleteRule={deleteRule}
                  toggleEnabled={toggleEnabled}
                  onViewMatches={setViewingMatches}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {draft && (
        <NewRuleModal
          draft={draft}
          setDraft={setDraft}
          conflictLabel={conflictLabel}
          onSave={save}
          onCancel={closeModal}
        />
      )}

      {viewingMatches && (
        <RuleMatchesModal
          rule={viewingMatches}
          dictionaries={dictionaries}
          updateEntry={updateEntry}
          onClose={() => setViewingMatches(null)}
        />
      )}
    </div>
  );
});

RulesManager.displayName = 'RulesManager';

export default RulesManager;

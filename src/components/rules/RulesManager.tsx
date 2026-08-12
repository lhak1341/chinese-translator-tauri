import { useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { PlusCircle, Filter } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { useDictionary } from '../dictionary/DictionaryContext';
import RuleMatchesModal from './RuleMatchesModal';
import NewRuleModal from './NewRuleModal';
import RuleRow from './RuleRow';
import { useTransformRules } from '../../hooks/useTransformRules';
import { compareRulePrecedence } from '../../utils/dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';
import {
  SEMANTIC_TYPE_LIST,
  SEMANTIC_TYPE_LABELS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPE_COLORS,
} from '../../constants/SemanticTypes';
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
  moveWords: 0,
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
    // Key is capped at 4 Chinese chars (see TransformRuleTypes.ts) — truncate via an
    // array spread, not string slicing, so a surrogate-pair character never splits.
    const key = [...prefillText].slice(0, 4).join('');
    setDraft({ ...EMPTY_DRAFT, key, capitalizeExceptN: [...key].length });
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
      <div className={styles.header}>
        <input
          type="text"
          placeholder="Search rules..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search rules"
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: 'var(--background-color)',
            color: 'var(--text-color)',
            fontSize: '0.875rem',
          }}
        />
        <button
          onClick={() => setShowFilterPanel((v) => !v)}
          className="icon"
          title={showFilterPanel ? 'Hide filters' : 'Filter by semantic type'}
          style={{
            padding: '0.5rem',
            backgroundColor:
              filterSemanticTypes.size > 0
                ? 'var(--accent-color)'
                : showFilterPanel
                  ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                  : undefined,
            color: filterSemanticTypes.size > 0 ? 'white' : undefined,
            borderRadius: '4px',
          }}
        >
          <Filter size={16} />
        </button>
        <button
          className={`primary ${dmStyles.button}`}
          onClick={() => openNew()}
          title="Add new rule"
        >
          <PlusCircle size={15} />
          Add Rule
        </button>
      </div>

      {showFilterPanel && (
        <div
          style={{
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            backgroundColor: 'color-mix(in srgb, var(--accent-color) 5%, var(--background-color))',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
            Type:
          </span>
          {SEMANTIC_TYPE_LIST.map((type) => {
            const isActive = filterSemanticTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleSemanticTypeFilter(type)}
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
        </div>
      )}

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

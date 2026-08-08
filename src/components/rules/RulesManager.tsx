import { useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, PlusCircle, Filter, Search } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import dmStyles from '../../styles/DictionaryManager.module.css';
import { RowShell } from '../dictionary/VirtualRowComponent';
import { useDictionary } from '../dictionary/DictionaryContext';
import RuleMatchesModal from './RuleMatchesModal';
import { useTransformRules } from '../../hooks/useTransformRules';
import { useInlineFieldEdit } from '../../hooks/useInlineFieldEdit';
import type { TransformRule, TransformRuleMatchKind } from '../../types/TransformRuleTypes';
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

/** Longer keys first (matches the real matching precedence — longest key wins),
 * then alphabetical within a length, then by semantic type. */
function sortRules(rules: TransformRule[]): TransformRule[] {
  return [...rules].sort(
    (a, b) =>
      b.key.length - a.key.length ||
      a.key.localeCompare(b.key) ||
      a.semanticType.localeCompare(b.semanticType)
  );
}

/** Single-select semantic-type toggle row — pixel-identical badges to Dictionary's
 * SemanticTypeToggleCell (VirtualRowComponent.tsx): same container padding/gap and the
 * same per-badge inline style overrides (fontSize/padding/cursor) on top of the shared
 * `.metadataBadge` class — copy every value, not just the class name, or the chips drift
 * out of sync with what that class's own defaults would render.
 * Unlike that cell, a Transform Rule's semanticType is required, so the active badge
 * can't be toggled off — clicking it again is a no-op.
 */
function SemanticTypeToggles({
  activeType,
  onSelect,
  label,
}: {
  activeType: SemanticType;
  onSelect: (type: SemanticType) => void;
  label: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '0 0.25rem',
        gap: '2px',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_LIST.map((type) => {
        const isActive = activeType === type;
        const color = SEMANTIC_TYPE_COLORS[type];
        return (
          <span
            key={type}
            role="button"
            aria-label={`Set ${SEMANTIC_TYPE_LABELS[type]} for ${label}`}
            onClick={() => !isActive && onSelect(type)}
            className={dictStyles.metadataBadge}
            title={isActive ? SEMANTIC_TYPE_LABELS[type] : `Set as ${SEMANTIC_TYPE_LABELS[type]}`}
            style={{
              background: isActive ? color : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {SEMANTIC_TYPE_ABBREVIATIONS[type]}
          </span>
        );
      })}
    </div>
  );
}

/** Suffix/prefix toggle — same chip styling as SemanticTypeToggles (fontSize/padding
 * copied from Dictionary's badge convention) instead of a `<select>`, which crops in a
 * narrow table cell. Always exactly one of the two is active — clicking the active one
 * is a no-op (same "required, non-clearable" contract as SemanticTypeToggles). */
function MatchKindToggle({
  value,
  onSelect,
  label,
}: {
  value: TransformRuleMatchKind;
  onSelect: (matchKind: TransformRuleMatchKind) => void;
  label: string;
}) {
  const options: { value: TransformRuleMatchKind; abbrev: string }[] = [
    { value: 'prefix', abbrev: 'PRE' },
    { value: 'suffix', abbrev: 'SUF' },
  ];
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
      {options.map(({ value: option, abbrev }) => {
        const isActive = value === option;
        return (
          <span
            key={option}
            role="button"
            aria-label={`Set ${option} for ${label}`}
            onClick={() => !isActive && onSelect(option)}
            className={dictStyles.metadataBadge}
            title={isActive ? option : `Set as ${option}`}
            style={{
              background: isActive ? 'var(--primary-color, #3b82f6)' : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {abbrev}
          </span>
        );
      })}
    </div>
  );
}

/** Click-to-edit text/number cell — the same interaction Dictionary's table uses. */
function EditableCell({
  value,
  onCommit,
  type = 'text',
  placeholder,
  label,
}: {
  value: string;
  onCommit: (newValue: string) => Promise<void>;
  type?: 'text' | 'number';
  placeholder?: string;
  label: string;
}) {
  const edit = useInlineFieldEdit(value, onCommit);

  if (edit.editing) {
    return (
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        autoFocus
        aria-label={label}
        value={edit.tempValue}
        onChange={(e) => edit.handleChange(e.target.value)}
        onBlur={() => edit.commitEdit()}
        onKeyDown={edit.onKeyDown}
      />
    );
  }
  return (
    <span
      onClick={edit.startEdit}
      className={value ? undefined : styles.placeholderText}
      style={{ cursor: 'pointer' }}
      title="Click to edit"
      aria-label={label}
    >
      {value || placeholder || '—'}
    </span>
  );
}

function NewRuleModal({
  draft,
  setDraft,
  conflictLabel,
  onSave,
  onCancel,
}: {
  draft: Omit<TransformRule, 'id'>;
  setDraft: (d: Omit<TransformRule, 'id'>) => void;
  conflictLabel: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const handleKeyChange = (key: string) => {
    // Default Capitalize-except-N to the key's own length as the user types —
    // a reasonable starting point (see the worked "城"/moveWords=1,capitalizeExceptN=1
    // example) that the user can still override before saving.
    setDraft({ ...draft, key, capitalizeExceptN: [...key].length });
  };

  // Portal to document.body: Cmd-7 (see TabbedInterface.tsx) opens this modal without
  // switching tabs, so RulesManager's own ancestor (TabbedInterface's Rules tab panel)
  // stays `visibility: hidden` while the Translator tab is showing. A plain nested div
  // would inherit that hidden visibility despite `position: fixed`; the portal escapes
  // it entirely, same as it would need to for any modal opened from a hidden ancestor.
  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>New Rule</h3>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="rule-matchKind">Match</label>
            <select
              id="rule-matchKind"
              value={draft.matchKind}
              onChange={(e) =>
                setDraft({ ...draft, matchKind: e.target.value as TransformRuleMatchKind })
              }
            >
              <option value="suffix">Suffix (end of Source)</option>
              <option value="prefix">Prefix (start of Source)</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="rule-key">Key (1-4 Chinese chars)</label>
            <input
              id="rule-key"
              value={draft.key}
              maxLength={4}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="城"
            />
          </div>
        </div>

        {conflictLabel && (
          <div className={styles.formError}>
            Conflicts with existing rule &quot;{conflictLabel}&quot; — same match kind + key already
            exists.
          </div>
        )}

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="rule-moveWords">Move N words</label>
            <input
              id="rule-moveWords"
              type="number"
              min={0}
              value={draft.moveWords}
              onChange={(e) => setDraft({ ...draft, moveWords: Number(e.target.value) })}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="rule-capitalizeExceptN">Capitalize except N</label>
            <input
              id="rule-capitalizeExceptN"
              type="number"
              min={0}
              value={draft.capitalizeExceptN}
              onChange={(e) => setDraft({ ...draft, capitalizeExceptN: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="rule-moveReplacement">Replace moved words with (optional)</label>
            <input
              id="rule-moveReplacement"
              value={draft.moveReplacement ?? ''}
              placeholder="leave blank to move the words as-is"
              onChange={(e) => setDraft({ ...draft, moveReplacement: e.target.value || undefined })}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>Semantic type (stamped on match)</label>
            <SemanticTypeToggles
              activeType={draft.semanticType}
              label="new rule"
              onSelect={(semanticType) => setDraft({ ...draft, semanticType })}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="rule-charCount">Total-length limit (optional)</label>
            <input
              id="rule-charCount"
              type="number"
              min={1}
              value={draft.charCount ?? ''}
              placeholder="no limit"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  charCount: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="rule-label">Label (optional note)</label>
            <input
              id="rule-label"
              value={draft.label ?? ''}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>
        </div>

        <div className={styles.checkboxRow}>
          <input
            id="rule-enabled"
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          <label htmlFor="rule-enabled">Enabled</label>
        </div>

        <div className={styles.modalActions}>
          <button onClick={onSave} disabled={!draft.key || !!conflictLabel}>
            Save
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RuleRow({
  rule,
  updateRule,
  deleteRule,
  toggleEnabled,
  onViewMatches,
}: {
  rule: TransformRule;
  updateRule: (rule: TransformRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  onViewMatches: (rule: TransformRule) => void;
}) {
  const commitNumber = (field: 'moveWords' | 'capitalizeExceptN') => async (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) await updateRule({ ...rule, [field]: n });
  };

  return (
    <RowShell role="row">
      <div role="cell" className={dictStyles.checkboxCell}>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={() => toggleEnabled(rule.id)}
          aria-label={`Toggle ${rule.label || rule.key} enabled`}
        />
      </div>
      <div role="cell" className={styles.colMatch}>
        <MatchKindToggle
          value={rule.matchKind}
          label={rule.label || rule.key}
          onSelect={(matchKind) => updateRule({ ...rule, matchKind })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colKey} ${styles.key}`}>
        <EditableCell
          value={rule.key}
          label={`Key for ${rule.label || rule.key}`}
          onCommit={(key) => updateRule({ ...rule, key })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colChars}`}>
        <EditableCell
          value={rule.charCount !== undefined ? String(rule.charCount) : ''}
          placeholder="—"
          type="number"
          label={`Total-length limit for ${rule.label || rule.key}`}
          onCommit={async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 1) await updateRule({ ...rule, charCount: n });
          }}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colMove}`}>
        <EditableCell
          value={String(rule.moveWords)}
          type="number"
          label={`Move N words for ${rule.label || rule.key}`}
          onCommit={commitNumber('moveWords')}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colCap}`}>
        <EditableCell
          value={String(rule.capitalizeExceptN)}
          type="number"
          label={`Capitalize except N for ${rule.label || rule.key}`}
          onCommit={commitNumber('capitalizeExceptN')}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colReplace}`}>
        <EditableCell
          value={rule.moveReplacement ?? ''}
          placeholder="moves as-is"
          label={`Replace-moved-words for ${rule.label || rule.key}`}
          onCommit={async (v) => updateRule({ ...rule, moveReplacement: v || undefined })}
        />
      </div>
      <div role="cell" className={styles.colType}>
        <SemanticTypeToggles
          activeType={rule.semanticType}
          label={rule.label || rule.key}
          onSelect={(semanticType) => updateRule({ ...rule, semanticType })}
        />
      </div>
      <div role="cell" className={`${dictStyles.cellEditable} ${styles.colLabel}`}>
        <EditableCell
          value={rule.label ?? ''}
          placeholder="add a label"
          label={`Label for ${rule.label || rule.key}`}
          onCommit={(label) => updateRule({ ...rule, label })}
        />
      </div>
      <div role="cell" className={`${styles.rowActions} ${styles.colActions}`}>
        <button
          onClick={() => onViewMatches(rule)}
          aria-label={`View matching entries for ${rule.label || rule.key}`}
          title="View matching dictionary entries"
          className={styles.viewMatchesButton}
        >
          <Search size={14} />
        </button>
        <button
          onClick={() => deleteRule(rule.id)}
          aria-label={`Delete ${rule.label || rule.key}`}
          title="Delete rule"
          className={styles.deleteButton}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </RowShell>
  );
}

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

  const sortedRules = useMemo(() => sortRules(rules), [rules]);
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

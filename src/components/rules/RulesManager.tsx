import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import dictStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
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

const EMPTY_DRAFT: Omit<TransformRule, 'id'> = {
  matchKind: 'suffix',
  key: '',
  moveWords: 0,
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

/** Single-select semantic-type toggle row — same abbreviation badges as Dictionary's
 * SemanticTypeToggleCell (VirtualRowComponent.tsx), reusing its stylesheet for parity.
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
    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
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
            }}
          >
            {SEMANTIC_TYPE_ABBREVIATIONS[type]}
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

  return (
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
    </div>
  );
}

function RuleRow({
  rule,
  updateRule,
  deleteRule,
  toggleEnabled,
}: {
  rule: TransformRule;
  updateRule: (rule: TransformRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}) {
  const commitNumber = (field: 'moveWords' | 'capitalizeExceptN') => async (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) await updateRule({ ...rule, [field]: n });
  };

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={() => toggleEnabled(rule.id)}
          aria-label={`Toggle ${rule.label || rule.key} enabled`}
        />
      </td>
      <td>
        <select
          value={rule.matchKind}
          aria-label={`Match kind for ${rule.label || rule.key}`}
          onChange={(e) =>
            updateRule({ ...rule, matchKind: e.target.value as TransformRuleMatchKind })
          }
        >
          <option value="suffix">suffix</option>
          <option value="prefix">prefix</option>
        </select>
      </td>
      <td className={styles.key}>
        <EditableCell
          value={rule.key}
          label={`Key for ${rule.label || rule.key}`}
          onCommit={(key) => updateRule({ ...rule, key })}
        />
      </td>
      <td>
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
      </td>
      <td>
        <EditableCell
          value={String(rule.moveWords)}
          type="number"
          label={`Move N words for ${rule.label || rule.key}`}
          onCommit={commitNumber('moveWords')}
        />
      </td>
      <td>
        <EditableCell
          value={String(rule.capitalizeExceptN)}
          type="number"
          label={`Capitalize except N for ${rule.label || rule.key}`}
          onCommit={commitNumber('capitalizeExceptN')}
        />
      </td>
      <td>
        <SemanticTypeToggles
          activeType={rule.semanticType}
          label={rule.label || rule.key}
          onSelect={(semanticType) => updateRule({ ...rule, semanticType })}
        />
      </td>
      <td>
        <EditableCell
          value={rule.label ?? ''}
          placeholder="add a label"
          label={`Label for ${rule.label || rule.key}`}
          onCommit={(label) => updateRule({ ...rule, label })}
        />
      </td>
      <td className={styles.rowActions}>
        <button
          onClick={() => deleteRule(rule.id)}
          aria-label={`Delete ${rule.label || rule.key}`}
          title="Delete rule"
          className={styles.deleteButton}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

const RulesManager: React.FC = () => {
  const { rules, isLoading, checkConflict, addRule, updateRule, deleteRule, toggleEnabled } =
    useTransformRules();
  const [draft, setDraft] = useState<Omit<TransformRule, 'id'> | null>(null);

  const conflict = draft
    ? checkConflict({ id: '__new__', matchKind: draft.matchKind, key: draft.key })
    : undefined;
  const conflictLabel = conflict ? conflict.label || conflict.key : null;

  const sortedRules = useMemo(() => sortRules(rules), [rules]);

  const openNew = () => setDraft({ ...EMPTY_DRAFT });
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
    return <div className={styles.container}>Loading rules…</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Transform Rules</span>
        <button className={styles.addButton} onClick={openNew}>
          + Add rule
        </button>
      </div>

      {sortedRules.length === 0 ? (
        <div className={styles.empty}>
          No rules yet — add one to auto-transform matching dictionary entries.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>On</th>
              <th>Match</th>
              <th>Key</th>
              <th>Chars</th>
              <th>Move</th>
              <th>Cap</th>
              <th>Type</th>
              <th>Label</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                updateRule={updateRule}
                deleteRule={deleteRule}
                toggleEnabled={toggleEnabled}
              />
            ))}
          </tbody>
        </table>
      )}

      {draft && (
        <NewRuleModal
          draft={draft}
          setDraft={setDraft}
          conflictLabel={conflictLabel}
          onSave={save}
          onCancel={closeModal}
        />
      )}
    </div>
  );
};

export default RulesManager;

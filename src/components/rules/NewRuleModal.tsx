import { createPortal } from 'react-dom';
import styles from '../../styles/RulesManager.module.css';
import { SemanticTypeToggleCell } from '../dictionary/VirtualRowComponent';
import {
  parseValidatedNumber,
  parseValidatedKey,
} from '../../utils/dictionary/TransformRuleValidation';
import { deriveCapitalizeExceptNForKeyEdit } from '../../utils/dictionary/TransformRuleEngine';
import type { TransformRule, TransformRuleMatchKind } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import type { SemanticType } from '../../constants/SemanticTypes';

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
    // a reasonable starting point (see the worked "城"/relocate=true,capitalizeExceptN=1
    // example) that the user can still override before saving. Only re-derives on a
    // length change, so an override survives a same-length typo-fix.
    setDraft({
      ...draft,
      key,
      capitalizeExceptN: deriveCapitalizeExceptNForKeyEdit(draft.key, key, draft.capitalizeExceptN),
    });
  };

  // Number inputs commit every keystroke straight to draft state with no
  // per-keystroke guard (a typed "-" must stay visible while typing "-5" is
  // still in progress) — validity is checked here, once, to gate Save instead.
  const fieldsValid =
    parseValidatedKey(draft.key) !== null &&
    parseValidatedNumber(String(draft.capitalizeExceptN), 0) !== null &&
    (draft.charCount === undefined || parseValidatedNumber(String(draft.charCount), 1) !== null);

  // Portal to document.body: Cmd-7 (see TabbedInterface.tsx) opens this modal without
  // switching tabs, so RulesManager's own ancestor (TabbedInterface's Rules tab panel)
  // stays `visibility: hidden` while the Translator tab is showing. A plain nested div
  // would inherit that hidden visibility despite `position: fixed`; the portal escapes
  // it entirely, same as it would need to for any modal opened from a hidden ancestor.
  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>New Rule</h3>
        </div>
        <div className={styles.formBody}>
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
                maxLength={MAX_TRANSFORM_RULE_KEY_LENGTH}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="城"
              />
            </div>
          </div>

          {conflictLabel && (
            <div className={styles.formError}>
              Conflicts with &quot;{conflictLabel}&quot; — same match kind + key already used.
            </div>
          )}

          {!fieldsValid && (
            <div className={styles.formError}>
              Key must be 1-{MAX_TRANSFORM_RULE_KEY_LENGTH} Chinese characters; Capitalize except N
              must be a non-negative number; Total-length limit (if set) must be at least 1.
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="rule-relocate">Relocate to opposite end</label>
              <input
                id="rule-relocate"
                type="checkbox"
                checked={draft.relocate}
                onChange={(e) => setDraft({ ...draft, relocate: e.target.checked })}
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
              <label htmlFor="rule-moveReplacement">Replace key with (optional)</label>
              <input
                id="rule-moveReplacement"
                value={draft.moveReplacement ?? ''}
                placeholder="leave blank to use the key's plain gloss"
                onChange={(e) =>
                  setDraft({ ...draft, moveReplacement: e.target.value || undefined })
                }
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Semantic type</label>
              <SemanticTypeToggleCell
                activeType={draft.semanticType}
                rowLabel="new rule"
                onSelect={(semanticType) =>
                  setDraft({ ...draft, semanticType: semanticType as SemanticType })
                }
                clearable={false}
                size="form"
                align="left"
                width="100%"
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
            <button onClick={onCancel}>Cancel</button>
            <button className="primary" onClick={onSave} disabled={!!conflictLabel || !fieldsValid}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default NewRuleModal;

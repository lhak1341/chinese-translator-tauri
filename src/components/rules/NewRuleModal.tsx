import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';
import styles from '../../styles/RulesManager.module.css';
import entryStyles from '../../styles/DictionaryEntry.module.css';
import { RequiredSemanticTypeRow } from '../dictionary/SemanticTypePicker';
import {
  parseValidatedNumber,
  parseValidatedKey,
  ruleDraftProblem,
} from '../../utils/dictionary/TransformRuleValidation';
import {
  applyRule,
  deriveCapitalizeExceptNForKeyEdit,
  findRuleMatchingEntries,
  joinCharGloss,
} from '../../utils/dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import type { DictionaryData } from '../../types/DictionaryTypes';

/** How many matching entries the preview lists before "and N more". */
const PREVIEW_LIMIT = 4;

/**
 * The Cmd-7 / Add Rule form, in the Add form's layout: the key large on the left, what the rule
 * does on one row under it, the type as the Add form's chips, and — last — the entries the
 * rule matches, each with its saved translation beside the translation the rule would guess.
 * A rule never rewrites saved entries; it shapes the Add form's first guess for a new source,
 * which is what the preview shows.
 *
 * Every control keeps the accessible name the old form had ("Relocate to opposite end",
 * "Capitalize except N", …) while its visible text says what it does — RuleFieldParity.test.tsx
 * finds the same field in this form and in RuleRow by those names.
 */
function NewRuleModal({
  draft,
  setDraft,
  conflictLabel,
  onSave,
  onCancel,
  dictionaries = {},
}: {
  draft: Omit<TransformRule, 'id'>;
  setDraft: (d: Omit<TransformRule, 'id'>) => void;
  conflictLabel: string | null;
  onSave: () => void;
  onCancel: () => void;
  /** Searched for the preview. Omitted: no preview. */
  dictionaries?: Record<string, DictionaryData>;
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
  // still in progress) — what the draft means is decided once, at Save
  // (`commitRuleDraft`); this gate and its message, shown next to Save, are the same rule's.
  const message = ruleDraftProblem(draft, conflictLabel);
  const canSave = message === null;
  const keyValid = parseValidatedKey(draft.key) !== null;
  const charCountValid =
    draft.charCount === undefined || parseValidatedNumber(String(draft.charCount), 1) !== null;
  const suffix = draft.matchKind === 'suffix';

  // The preview matches on the key as it will be saved — trimmed.
  const rule: TransformRule = useMemo(
    () => ({ ...draft, key: draft.key.trim(), id: 'new-rule' }),
    [draft]
  );
  const matches = useMemo(
    () => (keyValid && charCountValid ? findRuleMatchingEntries(rule, dictionaries) : []),
    // The search reads only the match criteria; the transform fields don't change what matches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyValid, charCountValid, draft.matchKind, draft.key, draft.charCount, dictionaries]
  );
  const hasDictionaries = Object.keys(dictionaries).length > 0;

  // Portal to document.body: Cmd-7 (see TabbedInterface.tsx) opens this modal without
  // switching tabs, so RulesManager's own ancestor (TabbedInterface's Rules tab panel)
  // stays `visibility: hidden` while the Translator tab is showing. A plain nested div
  // would inherit that hidden visibility despite `position: fixed`; the portal escapes
  // it entirely, same as it would need to for any modal opened from a hidden ancestor.
  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-rule-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
          }
          // Cmd/Ctrl-Enter saves from any field, under the same gate as the Save button.
          if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
          e.preventDefault();
          if (canSave) onSave();
        }}
      >
        <h3 id="new-rule-title" className={entryStyles.visuallyHidden}>
          New Rule
        </h3>

        <div className={styles.ruleBody}>
          {/* What the rule matches. */}
          <div className={styles.ruleLine}>
            <div className={styles.matchSwitch} role="radiogroup" aria-label="Match">
              {(['suffix', 'prefix'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={draft.matchKind === kind}
                  // One Tab stop; the arrows switch, as in a native radio pair.
                  tabIndex={draft.matchKind === kind ? 0 : -1}
                  onClick={() => setDraft({ ...draft, matchKind: kind })}
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
                      return;
                    e.preventDefault();
                    const other = kind === 'suffix' ? 'prefix' : 'suffix';
                    setDraft({ ...draft, matchKind: other });
                    const sibling =
                      e.currentTarget.nextElementSibling ?? e.currentTarget.previousElementSibling;
                    (sibling as HTMLElement | null)?.focus();
                  }}
                  title={kind === 'suffix' ? 'Suffix (end of Source)' : 'Prefix (start of Source)'}
                >
                  {kind === 'suffix' ? 'Ends with' : 'Starts with'}
                </button>
              ))}
            </div>
            <input
              id="rule-key"
              aria-label="Key (1-4 Chinese chars)"
              className={styles.ruleKey}
              value={draft.key}
              maxLength={MAX_TRANSFORM_RULE_KEY_LENGTH}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="城"
              spellCheck={false}
              autoFocus
            />
            <label
              className={styles.ruleLength}
              title="Match only sources exactly this many characters long. Empty: any length."
            >
              Only at
              <input
                id="rule-charCount"
                aria-label="Total-length limit (optional)"
                type="number"
                min={1}
                value={draft.charCount ?? ''}
                placeholder="any"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    charCount: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              characters
            </label>
          </div>

          {/* What the rule does to the translation guess. */}
          <div className={styles.ruleThen}>
            <span className={styles.ruleThenLabel}>Then</span>
            <label
              className={entryStyles.pillToggle}
              title={`Move the key's words to the ${suffix ? 'front' : 'end'} of the translation`}
            >
              <input
                id="rule-relocate"
                aria-label="Relocate to opposite end"
                type="checkbox"
                // Explicit, because WebKit (the Tauri WebView) leaves checkboxes out of the
                // Tab order unless they carry a tabindex.
                tabIndex={0}
                checked={draft.relocate}
                onChange={(e) => setDraft({ ...draft, relocate: e.target.checked })}
              />
              Move to {suffix ? 'front' : 'end'}
            </label>
            <span
              className={styles.stepper}
              title={`Every word is capitalized except this many at the ${suffix ? 'end' : 'start'}, before anything moves`}
            >
              <span className={styles.stepperText}>Lowercase {suffix ? 'last' : 'first'}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-label="One fewer"
                onClick={() =>
                  setDraft({
                    ...draft,
                    capitalizeExceptN: Math.max(0, (Number(draft.capitalizeExceptN) || 0) - 1),
                  })
                }
              >
                −
              </button>
              <input
                id="rule-capitalizeExceptN"
                aria-label="Capitalize except N"
                type="number"
                min={0}
                value={draft.capitalizeExceptN}
                onChange={(e) => setDraft({ ...draft, capitalizeExceptN: Number(e.target.value) })}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="One more"
                onClick={() =>
                  setDraft({
                    ...draft,
                    capitalizeExceptN: (Number(draft.capitalizeExceptN) || 0) + 1,
                  })
                }
              >
                +
              </button>
            </span>
            <input
              id="rule-moveReplacement"
              aria-label="Replace key with (optional)"
              className={styles.ruleReplace}
              value={draft.moveReplacement ?? ''}
              placeholder={`Replace ${draft.key || 'the key'} with… (optional)`}
              onChange={(e) => setDraft({ ...draft, moveReplacement: e.target.value || undefined })}
              spellCheck={false}
            />
          </div>
        </div>

        <div
          className={entryStyles.typeGrid}
          style={{ gridTemplateColumns: '3.9rem repeat(6, 2.6rem)' }}
        >
          <RequiredSemanticTypeRow
            value={draft.semanticType}
            onChange={(semanticType) => setDraft({ ...draft, semanticType })}
            rowLabel="new rule"
          />
        </div>

        {hasDictionaries && (
          <div className={styles.rulePreview} aria-live="polite">
            {!keyValid || !charCountValid ? (
              <div className={styles.previewEmpty}>Fix the rule to see what it matches.</div>
            ) : matches.length === 0 ? (
              <div className={styles.previewEmpty}>
                No entries {suffix ? 'end' : 'start'} with {draft.key}
                {draft.charCount ? ` at ${draft.charCount} characters` : ''}.
              </div>
            ) : (
              <>
                <div className={styles.previewHead}>
                  <span>Your entries this rule matches</span>
                  <span>
                    {matches.length} match{matches.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className={styles.previewCols} aria-hidden="true">
                  <span />
                  <span>saved</span>
                  <span />
                  <span>rule&rsquo;s guess</span>
                </div>
                <ul className={styles.previewList}>
                  {matches.slice(0, PREVIEW_LIMIT).map((m) => {
                    const guess = applyRule(rule, m.source, (s) => joinCharGloss(dictionaries, s));
                    const same = guess === m.translation;
                    return (
                      <li key={`${m.dictionaryId}:${m.source}`} title={m.dictionaryLabel}>
                        <span className={styles.previewSource}>{m.source}</span>
                        <span className={styles.previewSaved}>{m.translation}</span>
                        <span className={styles.previewArrow} aria-hidden="true">
                          ⟶
                        </span>
                        <span className={same ? styles.previewSame : styles.previewGuess}>
                          {same ? 'same' : guess}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {matches.length > PREVIEW_LIMIT && (
                  <div className={styles.previewEmpty}>
                    and {matches.length - PREVIEW_LIMIT} more
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Set once, rarely changed: the note and Enabled come last. */}
        <div className={styles.ruleMeta}>
          <input
            id="rule-label"
            aria-label="Label (optional note)"
            className={styles.ruleNote}
            value={draft.label ?? ''}
            placeholder="Note (optional)"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <label
            className={entryStyles.pillToggle}
            title="A disabled rule is kept but never applied"
          >
            <input
              id="rule-enabled"
              type="checkbox"
              tabIndex={0}
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>

        <div className={entryStyles.footBar}>
          <div
            className={`${entryStyles.footMessage} ${message ? entryStyles.footError : ''}`}
            role={message ? 'alert' : undefined}
          >
            {message && <XCircle size={14} className={entryStyles.footIcon} />}
            {message ?? 'Esc cancels'}
          </div>
          <div className={entryStyles.footActions}>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={!canSave}
              title="Save (⌘↩)"
            >
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

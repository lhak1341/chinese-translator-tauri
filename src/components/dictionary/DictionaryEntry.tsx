import { isPatternsDict, entryCapabilities } from '../../utils/dictionary';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import { dictionaryOptionLabel } from './DictionaryTypes';
import styles from '../../styles/DictionaryEntry.module.css';
import type { EditingEntryData } from '../../types/DictionaryTypes';
import { SemanticTypePicker } from './SemanticTypePicker';
import { WordTransformToolbar } from './WordTransformToolbar';
import { VariableHighlightInput } from './VariableHighlightInput';
import { PATTERN_VARIABLE_COLORS } from '../../utils/text';
import { useDictionaryEntryForm } from '../../hooks/useDictionaryEntryForm';
import type { QuickAddShortlist, QuickAddView } from '../../utils/dictionary/QuickAddTarget';
import { markHiddenEdges, revealInRow } from '../../utils/ui/RevealInRow';

/** Pixels a revealed quick-switch chip keeps from the row's edge — wider than the row's 1rem
 * edge fade (`.shortlist` in `DictionaryEntry.module.css`), so the chip lands clear of it. */
const SHORTLIST_REVEAL_MARGIN = 24;

interface DictionaryEntryProps {
  /** Entry to edit (undefined for new entry) */
  entry?: EditingEntryData;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Currently selected dictionary ID */
  selectedDictionary: string;
  /** The quick-add view the opening surface decided its target over. Pass it (even `null`)
   * to offer a dictionary dropdown of that view's quick-add choices; omit it for none. */
  quickAddView?: QuickAddView | null;
  /** Cmd-3/Cmd-4's quick-add shortlist: shown as a toggle row under the dropdown when it has
   * more than one entry. Repeating the opening key cycles it; Option-1..9 jumps to an entry. */
  shortlist?: QuickAddShortlist | null;
  /** Callback when dictionary selection changes */
  onDictionaryChange?: (dictionaryId: string) => void;
  /** Initial source text (pre-populated from clipboard via keyboard shortcut) */
  initialSource?: string;
}

const DictionaryEntry: React.FC<DictionaryEntryProps> = ({
  entry,
  onClose,
  selectedDictionary,
  onDictionaryChange,
  initialSource,
  quickAddView,
  shortlist,
}) => {
  const { updateEntry, addEntry, dictionaries, dictionaryTypes, unreadDictionaryIds } =
    useDictionary();
  const form = useDictionaryEntryForm(entry, selectedDictionary, {
    updateEntry,
    addEntry,
    dictionaries,
    dictionaryTypes,
    initialSource,
    onDictionaryChange,
    quickAddView,
  });

  const showShortlist = !!shortlist && shortlist.ids.length > 1;
  const offersDropdown = quickAddView !== undefined;
  const canBeVariable = entryCapabilities(form.activeDictionary).variableFlag === 'toggle';
  const isPattern = isPatternsDict(form.activeDictionary);
  const sourceVars = isPattern ? (['X', 'Y'] as const).filter((v) => form.source.includes(v)) : [];
  const message = footerMessage(form);
  // Cmd/Ctrl-Enter clicks Save from anywhere in the form — a click, so the button's own
  // disabled state (invalid or saving) gates it exactly as it gates the mouse.
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // The quick-switch row scrolls sideways with no scrollbar, so keep the active chip in
  // view whenever it changes — a keyboard switch can pick one beyond either edge. Layout
  // effect: scrolled before paint, so the row never shows a frame with the chip cut off.
  const shortlistRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = shortlistRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row) return;
    if (active) revealInRow(row, active, SHORTLIST_REVEAL_MARGIN);
    markHiddenEdges(row);
  }, [form.activeDictionary, showShortlist]);

  // With the scrollbar hidden, a soft fade at an edge is what says more chips lie past it.
  // Re-marked on scroll (trackpad, or the reveal above) and on resize (the dialog or the
  // chips changing width).
  useEffect(() => {
    const row = shortlistRef.current;
    if (!row) return undefined;
    const mark = (): void => markHiddenEdges(row);
    row.addEventListener('scroll', mark, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', mark);
      observer?.disconnect();
    };
  }, [showShortlist]);

  const handleShortlistKey = (e: React.KeyboardEvent): void => {
    if (!shortlist) return;
    const target = shortlistKeyTarget(e, shortlist, form.activeDictionary);
    if (target === null) return;
    // Stop the window-level hotkey handler too: with a toggle button focused it would
    // otherwise read the repeated Cmd-3/Cmd-4 as a fresh Add.
    e.preventDefault();
    e.stopPropagation();
    if (showShortlist && !form.isSaving) form.selectDictionary(target);
  };

  const applyGloss = (): void => {
    if (form.roughGlossReference) form.setTranslation(form.roughGlossReference);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !form.isSaving) onClose();
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitButtonRef.current?.click();
    } else if (e.code === 'KeyG' && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      // Option-G types a character on macOS; take the key before it reaches the input.
      e.preventDefault();
      if (!form.isSaving) applyGloss();
    } else handleShortlistKey(e);
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    const ok = await form.handleSubmit(e);
    if (ok) onClose();
  };

  const title = entry ? 'Edit Entry' : 'New Entry';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dict-entry-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <form onSubmit={handleFormSubmit} className={styles.entryForm}>
          {/* Where the entry goes. */}
          <div className={styles.headBar}>
            <h2
              id="dict-entry-dialog-title"
              className={offersDropdown ? styles.visuallyHidden : styles.headTitle}
            >
              {title}
            </h2>
            {offersDropdown ? (
              <>
                <span className={styles.headLabel}>Add to</span>
                {showShortlist && (
                  <div
                    ref={shortlistRef}
                    className={styles.shortlist}
                    role="group"
                    aria-label="Quick switch"
                  >
                    {shortlist.ids.map((id, i) => (
                      <button
                        key={id}
                        type="button"
                        tabIndex={-1}
                        aria-pressed={id === form.activeDictionary}
                        className={`${styles.shortlistButton} ${id === form.activeDictionary ? styles.shortlistButtonActive : ''}`}
                        onClick={() => form.selectDictionary(id)}
                        disabled={form.isSaving}
                        title={`${id} (⌥${i + 1}, or ⌘${shortlist.kind === 'properNoun' ? 3 : 4} to cycle)`}
                      >
                        {shortlistLabel(id)}
                        {i < 9 && <kbd className={styles.shortlistKey}>⌥{i + 1}</kbd>}
                      </button>
                    ))}
                  </div>
                )}
                <select
                  id="entry-dictionary"
                  aria-label="Dictionary"
                  value={form.activeDictionary}
                  onChange={form.handleDictionaryChange}
                  className={styles.headSelect}
                  disabled={form.isSaving}
                  title="Every dictionary"
                >
                  {form.availableDictionaries.map(([id, { label }]) => (
                    <option key={id} value={id}>
                      {dictionaryOptionLabel(id, label, unreadDictionaryIds)}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className={styles.headMeta}>{form.activeDictionary}</span>
            )}
          </div>

          <div className={styles.entryBody}>
            {/* Source ⟶ translation on one line: the translation takes the width, since it is
                what gets typed; the source is only as wide as its text. */}
            <div className={styles.entryLine}>
              <VariableHighlightInput
                id="entry-source"
                aria-label="Source Text"
                inputRef={form.sourceInputRef}
                type="text"
                value={form.source}
                highlight={isPattern}
                onChange={form.handleSourceChange}
                className={styles.sourceInput}
                // In rem: the width sits on the wrapper, whose font is smaller than the
                // input's 1.35rem — one CJK character is about 1.1 of the input's em.
                style={{
                  width: `${(Math.max(3, [...form.source].length) * 1.1 + 0.8) * 1.35}rem`,
                  maxWidth: '19rem',
                }}
                disabled={form.isSaving}
                spellCheck={false}
              />
              <span className={styles.entryArrow} aria-hidden="true">
                ⟶
              </span>
              <VariableHighlightInput
                id="entry-translation"
                aria-label="Translation"
                inputRef={form.translationInputRef}
                type="text"
                value={form.translation}
                highlight={isPattern}
                onChange={(e) => form.setTranslation(e.target.value)}
                onFocus={form.handleTranslationFocus}
                className={`${styles.translationInput} ${message ? styles.invalid : ''}`}
                disabled={form.isSaving}
                spellCheck={false}
              />
              <span className={styles.sourceVars}>
                {sourceVars.length > 0 && (
                  <>
                    uses{' '}
                    {sourceVars.map((v) => (
                      <b key={v} style={{ color: PATTERN_VARIABLE_COLORS[v] }}>
                        {v}
                      </b>
                    ))}
                  </>
                )}
              </span>
              <span />
              <WordTransformToolbar
                value={form.translation}
                onChange={form.setTranslation}
                disabled={form.isSaving}
              />
              {/* The gloss, and the reuse toggle at the right end. The toggle is the first Tab
                  stop after the translation (the buttons between are out of the Tab order), so
                  "type the translation, Tab, Space" ticks it. */}
              {(form.roughGlossReference || canBeVariable) && (
                <div className={styles.metaRow}>
                  {form.roughGlossReference && (
                    <>
                      <span className={styles.glossLabel}>Gloss</span>
                      <span className={styles.glossText}>{form.roughGlossReference}</span>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={applyGloss}
                        disabled={form.isSaving || form.translation === form.roughGlossReference}
                        className={styles.glossUseButton}
                        title="Replace Translation with this plain character-only gloss"
                      >
                        Use <kbd>⌥G</kbd>
                      </button>
                    </>
                  )}
                  {canBeVariable && (
                    <label
                      className={`${styles.pillToggle} ${styles.reuseToggle}`}
                      title="Allow as pattern variable: when a pattern matches, this entry may fill its X or Y"
                    >
                      <input
                        type="checkbox"
                        id="allowAsPatternVariable"
                        // Explicit, because WebKit (the Tauri WebView) leaves checkboxes out
                        // of the Tab order unless they carry a tabindex.
                        tabIndex={0}
                        checked={form.allowAsPatternVariable}
                        onChange={(e) => form.setAllowAsPatternVariable(e.target.checked)}
                        disabled={form.isSaving}
                      />
                      Usable as <b>X/Y</b>
                    </label>
                  )}
                </div>
              )}
            </div>

            {form.showExistingEntryNotification &&
              form.existingEntry &&
              form.existingEntry.source &&
              form.existingEntry.translation && (
                <div
                  className={`${styles.notification} ${form.existingEntry.isSelectedDictionary ? styles.notificationWarning : styles.notificationSuccess}`}
                >
                  <div
                    className={`${styles.notificationContent} ${form.existingEntry.isSelectedDictionary ? styles.notificationTextWarning : styles.notificationTextSuccess}`}
                  >
                    {form.existingEntry.isSelectedDictionary ? (
                      <AlertTriangle size={16} className={styles.notificationIcon} />
                    ) : (
                      <Info size={16} className={styles.notificationIcon} />
                    )}
                    <div className={styles.notificationBody}>
                      <div className={styles.notificationTitle}>
                        {form.existingEntry.isSelectedDictionary
                          ? 'Already exists in this dictionary'
                          : `Found in ${form.existingEntry.dictionaryName}`}
                      </div>
                      <div
                        className={
                          form.existingEntry.isSelectedDictionary
                            ? styles.notificationDetailWarning
                            : styles.notificationDetailSuccess
                        }
                      >
                        &ldquo;{form.existingEntry.source}&rdquo; → &ldquo;
                        {form.existingEntry.translation}&rdquo;
                      </div>
                      {form.existingEntry.isSelectedDictionary ? (
                        <div className={styles.notificationHelper}>
                          Saving will update the existing entry
                        </div>
                      ) : (
                        <div className={styles.notificationActions}>
                          <button
                            type="button"
                            onClick={form.handleUseExistingTranslation}
                            className={styles.notificationButton}
                          >
                            Use this translation
                          </button>
                          <span className={styles.notificationButtonText}>
                            Click to copy from {form.existingEntry.dictionaryName}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={form.handleDismissNotification}
                      className={styles.dismissButton}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
          </div>

          <SemanticTypePicker
            semanticType={form.semanticType}
            onSemanticTypeChange={form.setSemanticType}
            allowedVariableTypes={form.allowedVariableTypes}
            onAllowedVariableTypesChange={form.setAllowedVariableTypes}
            activeDictionary={form.activeDictionary}
            allowAsPatternVariable={form.allowAsPatternVariable}
            source={form.source}
            isSaving={form.isSaving}
          />

          {/* The error sits next to Save, where the eye goes when Save is greyed out, and
              appearing moves nothing. */}
          <div className={styles.footBar}>
            <div
              className={`${styles.footMessage} ${message ? styles.footError : ''}`}
              role={message ? 'alert' : undefined}
            >
              {message && <XCircle size={14} className={styles.footIcon} />}
              {message ?? 'Esc cancels'}
            </div>
            <div className={styles.footActions}>
              <button type="button" onClick={onClose} disabled={form.isSaving}>
                Cancel
              </button>
              <button
                ref={submitButtonRef}
                type="submit"
                title="Save (⌘↩)"
                className={`primary ${styles.submitButton}`}
                disabled={form.isSaving || !form.isFormValid}
              >
                {form.isSaving ? 'Saving...' : 'Save'}
                {!form.isSaving && <kbd className={styles.submitKey}>⌘↩</kbd>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

type EntryForm = ReturnType<typeof useDictionaryEntryForm>;

/** What the footer reports, most urgent first: a failed save, then the live validation the
 * form is showing. `null` when there is nothing to report. */
function footerMessage(form: EntryForm): string | null {
  if (form.error) return form.error;
  if (form.showCharacterValidation && form.activeDictionary === 'characters') {
    return `Must be exactly 1 character (got ${form.source.trim().length}).`;
  }
  if (form.showPatternValidation && isPatternsDict(form.activeDictionary)) {
    return patternMessage(form.source.trim(), form.translation.trim());
  }
  return null;
}

/** Which pattern-variable rule the source/translation pair breaks, in words. */
function patternMessage(source: string, translation: string): string {
  const xCount = (source.match(/X/g) ?? []).length;
  const yCount = (source.match(/Y/g) ?? []).length;
  if (xCount > 1) return `Source can have at most one "X" (found ${xCount}).`;
  if (xCount === 0 && yCount > 0)
    return 'Source has "Y" but no "X" — add "X" first, or remove "Y" for a no-variable pattern.';
  if (xCount === 1 && !translation.includes('X')) return 'Translation is missing "X".';
  if (yCount > 0 && !translation.includes('Y')) return 'Translation is missing "Y".';
  return 'Source and translation variables don’t match.';
}

/** A shortlist button's text: "Base" for the root dictionary, else the id's suffix (`_AiCap`). */
function shortlistLabel(id: string): string {
  const dash = id.indexOf('-');
  return dash === -1 ? 'Base' : id.slice(dash + 1);
}

/**
 * The shortlist entry a key press inside the Add form picks, or `null` when the key is not a
 * shortlist key. Cmd-3 (proper nouns) or Cmd-4 (patterns) — the key that opened the form —
 * moves to the next entry, wrapping; from a dictionary off the shortlist it goes to the first.
 * Option-1..9 picks that entry. Matches `event.code`: Option remaps digit keys' `key` per layout.
 */
export function shortlistKeyTarget(
  event: Pick<React.KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  shortlist: QuickAddShortlist,
  active: string
): string | null {
  const { ids } = shortlist;
  if (event.shiftKey) return null;
  const cycleCode = shortlist.kind === 'properNoun' ? 'Digit3' : 'Digit4';
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === cycleCode) {
    return ids[(ids.indexOf(active) + 1) % ids.length];
  }
  const digit = /^Digit([1-9])$/.exec(event.code);
  if (event.altKey && !event.metaKey && !event.ctrlKey && digit) {
    return ids[Number(digit[1]) - 1] ?? null;
  }
  return null;
}

export default DictionaryEntry;

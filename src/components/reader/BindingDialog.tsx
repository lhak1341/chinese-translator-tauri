import React, { useState } from 'react';
import { AlertCircle, Check, Loader, X } from 'lucide-react';
import type { BookBinding, ChapterPatternId } from '../../types/ReaderTypes';
import type { ChapterOverride } from '../../hooks/useChapters';
import {
  CHAPTER_PATTERN_LABELS,
  formatMedianGap,
  formatRegularity,
} from '../../utils/reader/ChapterPatternLabels';
import {
  fictionDisplayName,
  initialBindingDraft,
  type BindingChoice,
  type FictionSuggestion,
} from '../../utils/reader/FictionDictionarySuggestion';
import styles from '../../styles/Reader.module.css';

interface BindingDialogProps {
  bookTitle: string;
  fileName: string;
  fictionDictionaries: string[];
  /** Derived from the file name by `BookReader`, which already needs it for the banner —
   * one computation, one answer, rather than two sites deriving it from the same inputs. */
  suggestion: FictionSuggestion;
  currentBinding: BookBinding | null;
  /** The recorded dictionary that no longer exists, if the book's is the one. */
  missingDictionary: string | null;
  isApplying: boolean;
  error: string | null;
  /** The chapter-structure choice — its election stats are the numbers that make an
   * override informed. */
  chapterOverride: ChapterOverride;
  onBind: (fictionDictionary: string | null) => void;
  onCreateAndBind: (rawName: string) => void;
  onClose: () => void;
}

/**
 * The binding dialog: which fiction dictionary this book uses, and — since it is the one
 * moment the reader is already looking at this book's metadata — what its chapter
 * structure was elected to be.
 *
 * Four answers, all equally reachable: accept the suggestion, pick a different existing
 * dictionary, create a new pair, or say there is none. Picking an existing one is not a
 * fallback path — the fiction namespace has author and franchise sets shared across
 * several books, so for a third of the library it is the *right* answer, and it is one
 * dropdown away rather than behind a mode switch.
 */
const BindingDialog: React.FC<BindingDialogProps> = ({
  bookTitle,
  fileName,
  fictionDictionaries,
  suggestion,
  currentBinding,
  missingDictionary,
  isApplying,
  error,
  chapterOverride,
  onBind,
  onCreateAndBind,
  onClose,
}) => {
  const { candidates, activePattern, isOverridden, set: onSetOverride } = chapterOverride;
  // One decision, three pieces of state: `initialBindingDraft` says what it opens on.
  const [initial] = useState(() =>
    initialBindingDraft({
      binding: currentBinding,
      missing: missingDictionary,
      suggestion,
      fileName,
    })
  );
  const [choice, setChoice] = useState<BindingChoice>(initial.choice);
  const [selected, setSelected] = useState<string>(initial.selected);
  const [newName, setNewName] = useState<string>(initial.newName);

  const canSave =
    !isApplying &&
    ((choice === 'existing' && selected !== '') ||
      (choice === 'new' && newName.trim() !== '') ||
      choice === 'none');

  const save = (): void => {
    if (!canSave) return;
    if (choice === 'new') onCreateAndBind(newName);
    else onBind(choice === 'none' ? null : selected);
  };

  return (
    <div className={styles.bindingOverlay} role="dialog" aria-label="Dictionaries for this book">
      <div className={styles.bindingDialog}>
        <div className={styles.bindingHeader}>
          <div>
            <div className={styles.bindingTitle}>Dictionaries for this book</div>
            <div className={styles.bindingSubtitle} title={fileName}>
              {bookTitle}
            </div>
          </div>
          <button onClick={onClose} className={styles.iconButton} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.bindingBody}>
          <div className={styles.bindingSection}>
            <div className={styles.bindingSectionTitle}>Fiction dictionary</div>
            <p className={styles.bindingHint}>
              {suggestion.dictionaryId ? (
                <>
                  Derived from the file name:{' '}
                  <span className={styles.bindingSuggestion}>
                    {fictionDisplayName(suggestion.dictionaryId)}
                  </span>
                  {suggestion.exists
                    ? ' — this one already exists.'
                    : ' — no dictionary by that name yet.'}{' '}
                  It is a guess, not a rule; an author or franchise set shared with other books is
                  just as likely to be the right answer.
                </>
              ) : (
                'Nothing could be derived from this file name — pick or create one below.'
              )}
            </p>

            <label className={styles.bindingOption}>
              <input
                type="radio"
                name="binding-choice"
                checked={choice === 'existing'}
                disabled={fictionDictionaries.length === 0}
                onChange={() => setChoice('existing')}
              />
              <span>Use an existing dictionary</span>
              <select
                value={selected}
                disabled={fictionDictionaries.length === 0}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setChoice('existing');
                }}
              >
                {/* Falling back to the alphabetically first dictionary would let Save bind
                    something nobody chose. An empty value cannot be saved (see canSave). */}
                {selected === '' && (
                  <option value="">
                    {fictionDictionaries.length === 0 ? 'None exist yet' : 'Choose one…'}
                  </option>
                )}
                {fictionDictionaries.map((id) => (
                  <option key={id} value={id}>
                    {fictionDisplayName(id)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.bindingOption}>
              <input
                type="radio"
                name="binding-choice"
                checked={choice === 'new'}
                onChange={() => setChoice('new')}
              />
              <span>Create a new pair</span>
              <input
                type="text"
                value={newName}
                placeholder="e.g. TapDo"
                onChange={(event) => {
                  setNewName(event.target.value);
                  setChoice('new');
                }}
                className={styles.bindingInput}
              />
            </label>

            <label className={styles.bindingOption}>
              <input
                type="radio"
                name="binding-choice"
                checked={choice === 'none'}
                onChange={() => setChoice('none')}
              />
              <span>No fiction dictionary — remember this and stop asking</span>
            </label>
          </div>

          <div className={styles.bindingSection}>
            <div className={styles.bindingSectionTitle}>Chapter structure</div>
            <p className={styles.bindingHint}>
              {activePattern
                ? `Using ${CHAPTER_PATTERN_LABELS[activePattern]}${isOverridden ? ' (your choice)' : ' (elected)'}.`
                : 'No structure was elected for this book.'}
            </p>

            {candidates.length === 0 ? (
              <div className={styles.bindingEmpty}>No candidates were scored for this book.</div>
            ) : (
              <table className={styles.bindingTable}>
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Hits</th>
                    <th>Median gap</th>
                    <th>Regularity</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr
                      key={candidate.pattern}
                      className={
                        candidate.pattern === activePattern ? styles.bindingTableActive : undefined
                      }
                    >
                      <td>
                        {candidate.pattern === activePattern && (
                          <Check size={12} aria-hidden="true" />
                        )}{' '}
                        {CHAPTER_PATTERN_LABELS[candidate.pattern]}
                      </td>
                      <td>{candidate.hitCount.toLocaleString()}</td>
                      <td>{formatMedianGap(candidate)}</td>
                      <td>{formatRegularity(candidate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <label className={styles.outlineOverride}>
              <span>Override</span>
              <select
                value={isOverridden && activePattern ? activePattern : ''}
                onChange={(event) =>
                  onSetOverride(
                    event.target.value === '' ? null : (event.target.value as ChapterPatternId)
                  )
                }
              >
                <option value="">Auto — trust the election</option>
                {candidates.map((candidate) => (
                  <option key={candidate.pattern} value={candidate.pattern}>
                    {CHAPTER_PATTERN_LABELS[candidate.pattern]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className={styles.bindingFooter}>
          <button onClick={onClose} className={styles.secondaryButton}>
            Cancel
          </button>
          <button onClick={save} disabled={!canSave} className={styles.primaryButton}>
            {isApplying && <Loader size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default BindingDialog;

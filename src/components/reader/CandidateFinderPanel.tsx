import React, { useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Candidate, CandidateStage } from '../../types/ReaderTypes';
import type { CandidateFinderSnapshot } from '../../utils/reader/CandidateFinderStore';
import type { CandidateAdder } from '../../utils/reader/CandidateAdd';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { getDictionaryLabel } from '../../utils/dictionary/DictionaryLabels';
import styles from '../../styles/Reader.module.css';

interface CandidateFinderPanelProps {
  snapshot: CandidateFinderSnapshot;
  adder: CandidateAdder;
  onRun: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const STAGE_LABELS: Record<CandidateStage, string> = {
  reading: 'Reading',
  counting: 'Counting',
  scoring: 'Scoring',
};

interface CandidateRowProps {
  candidate: Candidate;
  adder: CandidateAdder;
}

/**
 * One candidate and its Add: an editable translation seeded with the Add form's guess (Enter
 * adds) and the dictionary to add to. A failed add keeps the row and says why; a successful
 * one needs no handling here, because the row leaves when the dictionary holds its name.
 */
const CandidateRow: React.FC<CandidateRowProps> = ({ candidate, adder }) => {
  const { text } = candidate;
  const [target, setTarget] = useState(adder.opened);
  const [translation, setTranslation] = useState(() => adder.guess(text, adder.opened));
  const [pending, setPending] = useState(false);
  // A ref, not `pending`: two Enters before the re-render would both see `false`.
  const inFlight = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  // Like the Add form's dropdown, switching the target re-seeds the guess for it.
  const changeTarget = (next: string): void => {
    setTarget(next);
    setTranslation(adder.guess(text, next));
  };

  const add = async (): Promise<void> => {
    if (inFlight.current) return;
    if (!translation.trim()) {
      setMessage('Enter a translation first');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      await adder.add(text, target, translation);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <li className={styles.candidateRow}>
      <span className={styles.candidateText}>
        {text}
        {candidate.alsoIn.length > 0 && (
          <small className={styles.candidateTag}>
            in {candidate.alsoIn.map(getDictionaryLabel).join(', ')}, not active here
          </small>
        )}
      </span>
      <span>{candidate.count}</span>
      <span>{candidate.lineCount}</span>
      <div className={styles.candidateAdd}>
        <input
          className={styles.candidateInput}
          value={translation}
          aria-label={`Translation of ${text}`}
          onChange={(event) => setTranslation(event.target.value)}
          onKeyDown={(event) => {
            // WebKit ends a composition before this keydown, so `isComposing` is already false;
            // the committing Enter still carries keyCode 229.
            const composing = event.nativeEvent.isComposing || event.keyCode === 229;
            if (event.key === 'Enter' && !composing) void add();
          }}
        />
        <select
          className={styles.candidateSelect}
          value={target}
          aria-label={`Add ${text} to`}
          onChange={(event) => changeTarget(event.target.value)}
        >
          {adder.choices.map((id) => (
            <option key={id} value={id}>
              {getDictionaryLabel(id)}
            </option>
          ))}
        </select>
        <button
          onClick={() => void add()}
          disabled={pending}
          className={styles.secondaryButton}
          aria-label={`Add ${text}`}
        >
          Add
        </button>
      </div>
      {message && (
        <div className={styles.error} role="alert">
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </li>
  );
};

const CandidateList: React.FC<{
  candidates: Candidate[];
  adder: CandidateAdder;
  onRun: () => void;
}> = ({ candidates, adder, onRun }) => {
  // Rows leave the list as the dictionaries come to hold them, and return on Undo; the list
  // itself is never re-run.
  const remaining = candidates.filter((candidate) => !adder.isAdded(candidate.text));
  const added = candidates.length - remaining.length;
  return (
    <>
      {added > 0 && (
        <div className={styles.outlineEmpty} role="status">
          {added} added since this run, re-run to update
        </div>
      )}
      {remaining.length > 0 && (
        <>
          <div className={styles.candidateHeaderRow}>
            <span>Candidate</span>
            <span>Count</span>
            <span>Lines</span>
          </div>
          <ul className={styles.outlineList}>
            {remaining.map((candidate) => (
              <CandidateRow key={candidate.text} candidate={candidate} adder={adder} />
            ))}
          </ul>
        </>
      )}
      <button onClick={onRun} className={styles.secondaryButton}>
        Run again
      </button>
    </>
  );
};

/**
 * Slide-over for the Candidate finder (GLOSSARY.md "Candidate finder"), built like the
 * chapter outline's: not run, running, results, and a clean result. It only reads the
 * finder's snapshot; whether closing cancels is the owner's call.
 */
const CandidateFinderPanel: React.FC<CandidateFinderPanelProps> = ({
  snapshot,
  adder,
  onRun,
  onCancel,
  onClose,
}) => (
  <div className={styles.outlinePanel} aria-label="Candidate finder">
    <div className={styles.outlinePanelHeader}>
      <span className={styles.outlinePanelTitle}>Candidates</span>
      <button onClick={onClose} className={styles.iconButton} aria-label="Close candidate finder">
        <X size={16} />
      </button>
    </div>

    {snapshot.status === 'idle' && (
      <>
        <div className={styles.outlineEmpty}>
          Finds strings of 2-8 characters that this book repeats like proper nouns and that no
          phrase entry holds. Nothing is written to any dictionary.
        </div>
        <button onClick={onRun} className={styles.primaryButton}>
          Run
        </button>
      </>
    )}

    {snapshot.status === 'running' && (
      <>
        <div className={styles.outlineEmpty} role="status">
          {STAGE_LABELS[snapshot.stage]} · {snapshot.percent}%
        </div>
        <span className={styles.readingProgressTrack} aria-hidden="true">
          <span className={styles.readingProgressFill} style={{ width: `${snapshot.percent}%` }} />
        </span>
        <button onClick={onCancel} className={styles.secondaryButton}>
          Cancel
        </button>
      </>
    )}

    {snapshot.status === 'error' && (
      <>
        <div className={styles.error}>
          <AlertCircle size={14} />
          {snapshot.message}
        </div>
        <button onClick={onRun} className={styles.secondaryButton}>
          Run again
        </button>
      </>
    )}

    {snapshot.status === 'done' && snapshot.candidates.length === 0 && (
      <>
        <div className={styles.outlineEmpty}>No new names found.</div>
        <button onClick={onRun} className={styles.secondaryButton}>
          Run again
        </button>
      </>
    )}

    {snapshot.status === 'done' && snapshot.candidates.length > 0 && (
      <CandidateList candidates={snapshot.candidates} adder={adder} onRun={onRun} />
    )}
  </div>
);

export default CandidateFinderPanel;

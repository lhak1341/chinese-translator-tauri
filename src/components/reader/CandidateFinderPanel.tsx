import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { Candidate, CandidateContext, CandidateStage } from '../../types/ReaderTypes';
import type { CandidateFinderSnapshot } from '../../utils/reader/CandidateFinderStore';
import type { CandidateAdder } from '../../utils/reader/CandidateAdd';
import type { CandidateDismissals } from '../../hooks/useCandidateFinder';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { getDictionaryLabel } from '../../utils/dictionary/DictionaryLabels';
import styles from '../../styles/Reader.module.css';

interface CandidateFinderPanelProps {
  snapshot: CandidateFinderSnapshot;
  adder: CandidateAdder;
  dismissals: CandidateDismissals;
  reading: CandidateReading;
  onRun: () => void;
  onCancel: () => void;
  onClose: () => void;
}

/** What the panel reads from the open book: lines that hold a name, the character-only gloss of
 * a Chinese string, and the jump that lights a line in the three Reader panels. */
export interface CandidateReading {
  context: (text: string) => Promise<CandidateContext>;
  gloss: (text: string) => Promise<string>;
  /** `line` is the file's own 0-based number. */
  jump: (line: number) => void;
}

/** Whether `ref`'s element has come into view, and stays true after: a gloss is computed for
 * what the reader has seen, never for a row they have not scrolled to. Without
 * `IntersectionObserver` (a test DOM) everything counts as in view. */
function useSeen(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The character-only gloss of `text`, fetched once `enabled` and then kept. A failed gloss
 * shows nothing: it is a reading aid, not something to block a row on. */
const Gloss: React.FC<{ text: string; reading: CandidateReading; enabled: boolean }> = ({
  text,
  reading,
  enabled,
}) => {
  const [gloss, setGloss] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    reading.gloss(text).then(
      (value) => current && setGloss(value),
      () => undefined
    );
    return () => {
      current = false;
    };
  }, [enabled, reading, text]);
  return gloss ? <small className={styles.candidateGloss}>{gloss}</small> : null;
};

/** A candidate's context, fetched when its row first unfolds. */
const CandidateContextLines: React.FC<{
  text: string;
  note: string;
  reading: CandidateReading;
}> = ({ text, note, reading }) => {
  const [result, setResult] = useState<CandidateContext | { error: string } | null>(null);
  // A ref: `reading` changes with the engine, and each fetch is a scan of the whole book.
  const contextRef = useRef(reading.context);
  contextRef.current = reading.context;
  useEffect(() => {
    let current = true;
    contextRef.current(text).then(
      (value) => current && setResult(value),
      (error: unknown) => current && setResult({ error: extractErrorMessage(error) })
    );
    return () => {
      current = false;
    };
  }, [text]);

  if (result === null) return <div className={styles.candidateContext}>Loading…</div>;
  if ('error' in result) {
    return (
      <div className={styles.error} role="alert">
        <AlertCircle size={14} />
        {result.error}
      </div>
    );
  }
  const more = result.total - result.lines.length;
  return (
    <div className={styles.candidateContext}>
      <ul className={styles.outlineList}>
        {result.lines.map(({ line, text: content }) => (
          <li key={line}>
            <button
              className={styles.candidateContextLine}
              aria-label={`Jump to line ${line + 1}`}
              onClick={() => reading.jump(line)}
            >
              <span lang="zh">{content}</span>
              <Gloss text={content} reading={reading} enabled />
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <small className={styles.candidateTag}>
          {more} more {more === 1 ? 'line' : 'lines'} in the book
        </small>
      )}
      <small className={styles.candidateTag}>Type: {note}</small>
    </div>
  );
};

const STAGE_LABELS: Record<CandidateStage, string> = {
  reading: 'Reading',
  'background table': 'Building the library index',
  counting: 'Counting',
  scoring: 'Scoring',
};

interface CandidateRowProps {
  candidate: Candidate;
  adder: CandidateAdder;
  dismissals: CandidateDismissals;
  reading: CandidateReading;
}

/**
 * One candidate and its Add: an editable translation seeded with the Add form's guess (Enter
 * adds) and the dictionary to add to. A failed add keeps the row and says why; a successful
 * one needs no handling here, because the row leaves when the dictionary holds its name.
 * × dismisses the name for this book; the row leaves when the record holds it.
 */
const CandidateRow: React.FC<CandidateRowProps> = ({ candidate, adder, dismissals, reading }) => {
  const { text } = candidate;
  const rowRef = useRef<HTMLLIElement>(null);
  const seen = useSeen(rowRef);
  const [unfolded, setUnfolded] = useState(false);
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

  const dismiss = async (): Promise<void> => {
    try {
      await dismissals.dismiss(text);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  };

  return (
    <li ref={rowRef} className={styles.candidateRow}>
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
      <Gloss text={text} reading={reading} enabled={seen} />
      <div className={styles.candidateAdd}>
        <button
          onClick={() => setUnfolded((open) => !open)}
          className={styles.iconButton}
          aria-expanded={unfolded}
          aria-label={`${unfolded ? 'Hide' : 'Show'} context for ${text}`}
        >
          {unfolded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
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
        <button
          onClick={() => void dismiss()}
          disabled={!dismissals.canDismiss}
          className={styles.iconButton}
          aria-label={`Dismiss ${text}`}
        >
          <X size={14} />
        </button>
      </div>
      {unfolded && (
        <CandidateContextLines text={text} note={adder.typeNote(text, target)} reading={reading} />
      )}
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
  dismissals: CandidateDismissals;
  reading: CandidateReading;
  onRun: () => void;
}> = ({ candidates, adder, dismissals, reading, onRun }) => {
  // Rows leave the list as the dictionaries come to hold them, and return on Undo; the list
  // itself is never re-run.
  const notDismissed = candidates.filter((candidate) => !dismissals.names.includes(candidate.text));
  const remaining = notDismissed.filter((candidate) => !adder.isAdded(candidate.text));
  const added = notDismissed.length - remaining.length;
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
              <CandidateRow
                key={candidate.text}
                candidate={candidate}
                adder={adder}
                dismissals={dismissals}
                reading={reading}
              />
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

/** One dismissed name with its gloss and Restore. */
const DismissedItem: React.FC<{
  name: string;
  reading: CandidateReading;
  onRestore: (name: string) => void;
}> = ({ name, reading, onRestore }) => {
  const ref = useRef<HTMLLIElement>(null);
  const seen = useSeen(ref);
  return (
    <li ref={ref} className={styles.candidateDismissed}>
      <span>{name}</span>
      <Gloss text={name} reading={reading} enabled={seen} />
      <button
        onClick={() => onRestore(name)}
        className={styles.secondaryButton}
        aria-label={`Restore ${name}`}
      >
        Restore
      </button>
    </li>
  );
};

/** Names dismissed for this book, collapsed, each with Restore. Shown in every state, since
 * Restore doesn't need a run. */
const DismissedList: React.FC<{ dismissals: CandidateDismissals; reading: CandidateReading }> = ({
  dismissals,
  reading,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  if (dismissals.names.length === 0) return null;
  const restore = async (name: string): Promise<void> => {
    setMessage(null);
    try {
      await dismissals.restore(name);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  };
  return (
    <details>
      <summary>Dismissed ({dismissals.names.length})</summary>
      <ul className={styles.outlineList}>
        {dismissals.names.map((name) => (
          <DismissedItem
            key={name}
            name={name}
            reading={reading}
            onRestore={(restored) => void restore(restored)}
          />
        ))}
      </ul>
      {message && (
        <div className={styles.error} role="alert">
          <AlertCircle size={14} />
          {message}
        </div>
      )}
    </details>
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
  dismissals,
  reading,
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

    {dismissals.unreadable && (
      <div className={styles.error}>
        <AlertCircle size={14} />
        {dismissals.unreadable}
      </div>
    )}

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

    {snapshot.status === 'done' && snapshot.weakFiltering && (
      <div className={styles.outlineEmpty} role="status">
        Common-word filtering is weak: fewer than 4 other books are indexed.
      </div>
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
      <CandidateList
        candidates={snapshot.candidates}
        adder={adder}
        dismissals={dismissals}
        reading={reading}
        onRun={onRun}
      />
    )}

    <DismissedList dismissals={dismissals} reading={reading} />
  </div>
);

export default CandidateFinderPanel;

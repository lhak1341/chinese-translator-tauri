import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { CandidateStage } from '../../types/ReaderTypes';
import type { CandidateFinderSnapshot } from '../../utils/reader/CandidateFinderStore';
import { getDictionaryLabel } from '../../utils/dictionary/DictionaryLabels';
import styles from '../../styles/Reader.module.css';

interface CandidateFinderPanelProps {
  snapshot: CandidateFinderSnapshot;
  onRun: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const STAGE_LABELS: Record<CandidateStage, string> = {
  reading: 'Reading',
  counting: 'Counting',
  scoring: 'Scoring',
};

/**
 * Slide-over for the Candidate finder (GLOSSARY.md "Candidate finder"), built like the
 * chapter outline's: not run, running, results, and a clean result. It only reads the
 * finder's snapshot; whether closing cancels is the owner's call.
 */
const CandidateFinderPanel: React.FC<CandidateFinderPanelProps> = ({
  snapshot,
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
      <>
        <div className={styles.candidateHeaderRow}>
          <span>Candidate</span>
          <span>Count</span>
          <span>Lines</span>
        </div>
        <ul className={styles.outlineList}>
          {snapshot.candidates.map((candidate) => (
            <li key={candidate.text} className={styles.candidateRow}>
              <span className={styles.candidateText}>
                {candidate.text}
                {candidate.alsoIn.length > 0 && (
                  <small className={styles.candidateTag}>
                    in {candidate.alsoIn.map(getDictionaryLabel).join(', ')}, not active here
                  </small>
                )}
              </span>
              <span>{candidate.count}</span>
              <span>{candidate.lineCount}</span>
            </li>
          ))}
        </ul>
        <button onClick={onRun} className={styles.secondaryButton}>
          Run again
        </button>
      </>
    )}
  </div>
);

export default CandidateFinderPanel;

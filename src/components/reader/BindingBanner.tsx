import React from 'react';
import { BookMarked, X } from 'lucide-react';
import { fictionDisplayName } from '../../utils/reader/FictionDictionarySuggestion';
import styles from '../../styles/Reader.module.css';

interface BindingBannerProps {
  /** The name derived from the file, or `null` when nothing could be derived from it. */
  suggestedDictionary: string | null;
  /** The book's bound dictionary, when it no longer exists: the banner then says so
   * instead of offering a first binding. */
  missingDictionary?: string | null;
  onChoose: () => void;
  onDismiss: () => void;
}

/**
 * The offer to bind a fiction dictionary to the book now open.
 *
 * A banner, deliberately, not a modal. The suggestion behind it is right about two thirds
 * of the time, and a modal would make the other third block reading on a guess the reader
 * then has to correct. Dismissing it is not an answer — the book stays unbound and the
 * offer returns next time, which is the honest state — so dismissal is session-local and
 * nothing is written.
 */
const BindingBanner: React.FC<BindingBannerProps> = ({
  suggestedDictionary,
  missingDictionary = null,
  onChoose,
  onDismiss,
}) => (
  <div className={styles.bindingBanner}>
    <BookMarked size={15} className={styles.bindingBannerIcon} />
    <span className={styles.bindingBannerText}>
      {missingDictionary ? (
        <>
          This book&apos;s dictionary{' '}
          <span className={styles.bindingSuggestion}>{fictionDisplayName(missingDictionary)}</span>{' '}
          no longer exists — reading with the general dictionaries only.
        </>
      ) : (
        'No fiction dictionary for this book — reading with the general dictionaries only.'
      )}
      {!missingDictionary && suggestedDictionary && (
        <>
          {' '}
          <span className={styles.bindingSuggestion}>
            {fictionDisplayName(suggestedDictionary)}
          </span>{' '}
          looks like a match.
        </>
      )}
    </span>
    <button onClick={onChoose} className={styles.primaryButton}>
      Choose dictionaries
    </button>
    <button onClick={onDismiss} className={styles.iconButton} aria-label="Dismiss for now">
      <X size={14} />
    </button>
  </div>
);

export default BindingBanner;

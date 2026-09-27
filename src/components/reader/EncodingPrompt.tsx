import React from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { EncodingChoiceTrigger, EncodingReport } from '../../types/ReaderTypes';
import styles from '../../styles/Reader.module.css';

interface EncodingPromptProps {
  title: string;
  report: EncodingReport;
  /** Why the reader is being asked. Not `report.reason`, which is the detector's own
   * explanation of its answer. */
  trigger: EncodingChoiceTrigger;
  onChoose: (label: string) => void;
  onBack: () => void;
}

/**
 * Shown instead of the book when its encoding is the reader's to choose.
 *
 * Usually because detection could not establish one. The alternative — decoding anyway on
 * the detector's fallback answer — produces a full book of mojibake that looks like a
 * successfully opened file, because the fallback is a single-byte encoding that cannot
 * fail. Asking is the only honest move, so this screen replaces the text rather than
 * sitting above it.
 *
 * Also on request, from the palette, for a book that opened on a confident guess that was
 * wrong. Then the report is the open book's own, and its current label is marked.
 */
const EncodingPrompt: React.FC<EncodingPromptProps> = ({
  title,
  report,
  trigger,
  onChoose,
  onBack,
}) => (
  <div className={styles.reader}>
    <div className={styles.readerHeader}>
      <button onClick={onBack} className={styles.secondaryButton}>
        <ArrowLeft size={14} />
        Back
      </button>
      <span className={styles.readerTitle}>{title}</span>
    </div>

    <div className={styles.encodingPanel}>
      {trigger === 'uncertain' ? (
        <>
          <div className={styles.encodingHeading}>
            <AlertTriangle size={18} />
            <h3>This file&rsquo;s encoding could not be established</h3>
          </div>
          <p className={styles.encodingBody}>
            {report.reason ?? 'The detector could not settle on an encoding for this file.'} It was
            detected as <code>{report.detectedLabel}</code>, which decodes any byte sequence without
            complaint — so opening on that answer would show a whole book of mojibake that looks
            like success.
          </p>
          <p className={styles.encodingBody}>Choose an encoding to open it with:</p>
        </>
      ) : (
        <>
          <div className={styles.encodingHeading}>
            <h3>Reopen with a different encoding</h3>
          </div>
          <p className={styles.encodingBody}>
            This file is decoded as <code>{report.label}</code>
            {report.overridden ? ', chosen by hand' : ''}. If the text looks wrong, choose another
            encoding to reopen it with. Your reading position and dictionaries stay as they are.
          </p>
        </>
      )}
      <div className={styles.encodingChoices}>
        {report.candidates.map((candidate) => {
          const isCurrent = trigger === 'chosen' && candidate === report.label;
          return (
            <button
              key={candidate}
              className={isCurrent ? styles.secondaryButton : `primary ${styles.primaryButton}`}
              onClick={() => onChoose(candidate)}
            >
              {isCurrent ? `${candidate} (current)` : candidate}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

export default EncodingPrompt;

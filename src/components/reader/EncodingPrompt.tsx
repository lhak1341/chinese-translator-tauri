import React from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { EncodingReport } from '../../types/ReaderTypes';
import styles from '../../styles/Reader.module.css';

interface EncodingPromptProps {
  title: string;
  report: EncodingReport;
  onChoose: (label: string) => void;
  onBack: () => void;
}

/**
 * Shown instead of the book when detection could not establish an encoding.
 *
 * The alternative — decoding anyway on the detector's fallback answer — produces a full
 * book of mojibake that looks like a successfully opened file, because the fallback is a
 * single-byte encoding that cannot fail. Asking is the only honest move, so this screen
 * replaces the text rather than sitting above it.
 */
const EncodingPrompt: React.FC<EncodingPromptProps> = ({ title, report, onChoose, onBack }) => (
  <div className={styles.reader}>
    <div className={styles.readerHeader}>
      <button onClick={onBack} className={styles.secondaryButton}>
        <ArrowLeft size={14} />
        Back
      </button>
      <span className={styles.readerTitle}>{title}</span>
    </div>

    <div className={styles.encodingPanel}>
      <div className={styles.encodingHeading}>
        <AlertTriangle size={18} />
        <h3>This file&rsquo;s encoding could not be established</h3>
      </div>
      <p className={styles.encodingBody}>
        {report.reason ?? 'The detector could not settle on an encoding for this file.'} It was
        detected as <code>{report.detectedLabel}</code>, which decodes any byte sequence without
        complaint — so opening on that answer would show a whole book of mojibake that looks like
        success.
      </p>
      <p className={styles.encodingBody}>Choose an encoding to open it with:</p>
      <div className={styles.encodingChoices}>
        {report.candidates.map((candidate) => (
          <button
            key={candidate}
            className={`primary ${styles.primaryButton}`}
            onClick={() => onChoose(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default EncodingPrompt;

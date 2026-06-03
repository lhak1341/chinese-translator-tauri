import React from 'react';
import styles from '../../styles/DictionaryEntry.module.css';
import {
  capitalizeAll,
  lowercaseAll,
  capitalizeExceptLast,
  capitalizeExceptLastTwo,
  capitalizeExceptLastThree,
  moveLastWordToBeginning,
  moveLastTwoWordsToBeginning,
  moveLastThreeWordsToBeginning,
} from '../../utils/wordTransformHelpers';

interface WordTransformToolbarProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

export function WordTransformToolbar({
  value,
  onChange,
  disabled,
}: WordTransformToolbarProps): React.ReactElement {
  const wordCount = value.trim().split(' ').length;
  const hasText = Boolean(value.trim());

  return (
    <div className={styles.utilityActions}>
      <fieldset className={styles.utilityGroup}>
        <legend className={styles.utilityGroupLegend}>Capitalize</legend>
        <button
          type="button"
          onClick={() => onChange(capitalizeAll(value))}
          disabled={disabled || !hasText}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Capitalize all words (Title Case)"
        >
          AAAA
        </button>
        <button
          type="button"
          onClick={() => onChange(capitalizeExceptLast(value))}
          disabled={disabled || !hasText}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Capitalize all words except the last one"
        >
          ---a
        </button>
        <button
          type="button"
          onClick={() => onChange(capitalizeExceptLastTwo(value))}
          disabled={disabled || !hasText}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Capitalize all words except the last two"
        >
          --aa
        </button>
        <button
          type="button"
          onClick={() => onChange(capitalizeExceptLastThree(value))}
          disabled={disabled || !hasText}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Capitalize all words except the last three"
        >
          -aaa
        </button>
        <button
          type="button"
          onClick={() => onChange(lowercaseAll(value))}
          disabled={disabled || !hasText}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Lowercase all words"
        >
          aaaa
        </button>
      </fieldset>

      <fieldset className={styles.utilityGroup}>
        <legend className={styles.utilityGroupLegend}>Move to front</legend>
        <button
          type="button"
          onClick={() => onChange(moveLastWordToBeginning(value))}
          disabled={disabled || wordCount < 2}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Move last word to beginning"
        >
          ←1
        </button>
        <button
          type="button"
          onClick={() => onChange(moveLastTwoWordsToBeginning(value))}
          disabled={disabled || wordCount < 3}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Move last 2 words to beginning"
        >
          ←2
        </button>
        <button
          type="button"
          onClick={() => onChange(moveLastThreeWordsToBeginning(value))}
          disabled={disabled || wordCount < 4}
          tabIndex={-1}
          className={styles.utilityButton}
          title="Move last 3 words to beginning"
        >
          ←3
        </button>
      </fieldset>
    </div>
  );
}

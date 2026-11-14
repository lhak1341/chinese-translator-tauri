import React from 'react';
import { Tooltip, TooltipProvider } from '@lhak/style/react';
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

interface Transform {
  /** One letter per word, capital or small, read left to right: `AAAa` capitalizes all but
   * the last word. The move group reads `←N`, "last N words to the front". */
  label: string;
  /** The button's accessible name. The tooltip adds a preview of the result. */
  description: string;
  apply: (value: string) => string;
}

const CAPITALIZATION: Transform[] = [
  { label: 'AAAA', description: 'Capitalize all words (Title Case)', apply: capitalizeAll },
  {
    label: 'AAAa',
    description: 'Capitalize all words except the last one',
    apply: capitalizeExceptLast,
  },
  {
    label: 'AAaa',
    description: 'Capitalize all words except the last two',
    apply: capitalizeExceptLastTwo,
  },
  {
    label: 'Aaaa',
    description: 'Capitalize all words except the last three',
    apply: capitalizeExceptLastThree,
  },
  { label: 'aaaa', description: 'Lowercase all words', apply: lowercaseAll },
];

const MOVE_TO_FRONT: Transform[] = [
  { label: '←1', description: 'Move last word to beginning', apply: moveLastWordToBeginning },
  {
    label: '←2',
    description: 'Move last 2 words to beginning',
    apply: moveLastTwoWordsToBeginning,
  },
  {
    label: '←3',
    description: 'Move last 3 words to beginning',
    apply: moveLastThreeWordsToBeginning,
  },
];

/**
 * The Add form's rewrite buttons, directly under the translation they change: capitalization
 * and word order, as two segmented groups. Hovering a button previews its result in the
 * kit tooltip (one provider, so moving along the row shows each at once). A disabled button
 * gets no pointer events, so it shows no tooltip. Out of the Tab order — they are mouse
 * conveniences; the translation box is the keyboard's place.
 */
export function WordTransformToolbar({
  value,
  onChange,
  disabled,
}: WordTransformToolbarProps): React.ReactElement {
  const wordCount = value.trim().split(' ').length;
  const hasText = Boolean(value.trim());

  const button = (t: Transform, minWords: number, className: string): React.ReactElement => (
    <Tooltip
      key={t.label}
      label={t.description}
      content={hasText ? `${t.description}: ${t.apply(value)}` : t.description}
    >
      <button
        type="button"
        onClick={() => onChange(t.apply(value))}
        disabled={disabled || !hasText || wordCount < minWords}
        tabIndex={-1}
        className={`${styles.transformButton} ${className}`}
      >
        {t.label}
      </button>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div className={styles.transforms}>
        <div className={styles.transformGroup} role="group" aria-label="Capitalize">
          {CAPITALIZATION.map((t) => button(t, 1, styles.caseButton))}
        </div>
        <div className={styles.transformGroup} role="group" aria-label="Move to front">
          {MOVE_TO_FRONT.map((t, i) => button(t, i + 2, ''))}
        </div>
      </div>
    </TooltipProvider>
  );
}

import React from 'react';
import styles from '../../styles/HighlightableSegment.module.css';

interface HighlightableSegmentProps {
  text: string;
  unitIndex: number;
  isHighlighted: boolean;
  title: string;
  onClick: () => void;
}

/**
 * Canonical clickable span for char-only highlighting.
 * Owns: data-unit-index attribute, cursor style, and highlight class toggle.
 * Callers pre-compute isHighlighted; this component is a pure render primitive.
 */
export const HighlightableSegment = React.memo(
  ({ text, unitIndex, isHighlighted, title, onClick }: HighlightableSegmentProps) => (
    <span
      data-unit-index={unitIndex}
      onClick={onClick}
      className={`${styles.clickableSegment}${isHighlighted ? ` ${styles.clickableSegmentHighlighted}` : ''}`}
      title={title}
    >
      {text}
    </span>
  )
);

HighlightableSegment.displayName = 'HighlightableSegment';

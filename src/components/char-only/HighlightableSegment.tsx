import React from 'react';
import styles from '../../styles/HighlightableSegment.module.css';

interface HighlightableSegmentProps {
  text: string;
  unitIndex: number;
  isHighlighted: boolean;
  title: string;
  onUnitClick: (unitIndex: number) => void;
}

/**
 * Canonical clickable span for char-only highlighting.
 * Owns: data-unit-index attribute, cursor style, and highlight class toggle.
 * Callers pre-compute isHighlighted; this component is a pure render primitive.
 *
 * onUnitClick must stay referentially stable across the caller's renders — a fresh
 * closure per segment defeats this memo for every segment on every highlight change,
 * not just the one that changed. Takes unitIndex instead of a caller-built () => void
 * so callers pass the stable handler straight through with no wrapper.
 */
export const HighlightableSegment = React.memo(
  ({ text, unitIndex, isHighlighted, title, onUnitClick }: HighlightableSegmentProps) => (
    <span
      data-unit-index={unitIndex}
      onClick={() => onUnitClick(unitIndex)}
      className={`${styles.clickableSegment}${isHighlighted ? ` ${styles.clickableSegmentHighlighted}` : ''}`}
      title={title}
    >
      {text}
    </span>
  )
);

HighlightableSegment.displayName = 'HighlightableSegment';

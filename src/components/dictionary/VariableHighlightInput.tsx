import React, { useRef } from 'react';
import type { RefObject } from 'react';
import styles from '../../styles/DictionaryEntry.module.css';
import { PATTERN_VARIABLE_COLORS } from '../../utils/text';
import { PatternTemplateEngine } from '../../utils/pattern/PatternTemplateEngine.js';

interface VariableHighlightInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'style'
> {
  value: string;
  /** Colour the pattern variables (X, Y, #). Off: a plain input. */
  highlight: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Sizes the field — applied to the wrapper, which the input fills. */
  style?: React.CSSProperties;
}

/**
 * A text input whose pattern variables are coloured. An input can't colour part of its own
 * text, so a copy of the value is drawn over it with the variables in their colours, and the
 * input's own text is made transparent — the caret, selection and editing stay the input's.
 * The copy shares the input's class, so font, padding and border line up character for
 * character; it only overrides what makes it an overlay.
 *
 * A variable is what the pattern validator says it is (`PatternTemplateEngine.isVariableChar`),
 * so a capital fused to a word — the Y in "Yến" — is never coloured, and the colours always
 * agree with a "missing Y" error.
 */
export function VariableHighlightInput({
  value,
  highlight,
  inputRef,
  className = '',
  style,
  onScroll,
  ...inputProps
}: VariableHighlightInputProps): React.ReactElement {
  const mirrorRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.highlightField} style={style}>
      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        className={`${className} ${highlight ? styles.highlightedInput : ''}`}
        onScroll={(e) => {
          // A long value scrolls inside the input; the copy has to follow.
          if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
          onScroll?.(e);
        }}
      />
      {highlight && (
        <div
          ref={mirrorRef}
          className={`${className} ${styles.highlightMirror}`}
          aria-hidden="true"
        >
          {markVariables(value)}
        </div>
      )}
    </div>
  );
}

/** `text` with each pattern variable wrapped in a span of its colour. */
export function markVariables(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let run = '';
  for (let i = 0; i < text.length; i++) {
    if (PatternTemplateEngine.isVariableChar(text, i)) {
      if (run) out.push(run);
      run = '';
      out.push(
        <span key={i} style={{ color: PATTERN_VARIABLE_COLORS[text[i]] }} data-variable={text[i]}>
          {text[i]}
        </span>
      );
    } else run += text[i];
  }
  if (run) out.push(run);
  return out;
}

import React, { useState } from 'react';
import { parseLineJump } from '../../utils/reader/LineJump';
import styles from '../../styles/Reader.module.css';

interface LineJumpFieldProps {
  /** The reading anchor's line, 0-based. */
  line: number;
  lineCount: number;
  /** Jump to a 0-based line — the Reader's `scrollToLine`. */
  onJump: (line: number) => void;
}

/**
 * The chapter strip's "Line X of Y". Clicking it turns the number into a box holding the
 * current line; Enter jumps to the line typed (clamped into the book, `parseLineJump`),
 * Escape or leaving the box cancels. Something that is not a line number keeps the box
 * open, marked invalid.
 */
const LineJumpField: React.FC<LineJumpFieldProps> = ({ line, lineCount, onJump }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = (line + 1).toLocaleString();
  const total = lineCount.toLocaleString();

  if (draft === null) {
    return (
      <button
        type="button"
        className={styles.lineJumpButton}
        onClick={() => setDraft(String(line + 1))}
        title="Jump to a line"
        disabled={lineCount === 0}
      >
        Line {shown} of {total}
      </button>
    );
  }

  const target = parseLineJump(draft, lineCount);
  return (
    <span className={styles.lineJumpEditing}>
      Line
      <input
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        inputMode="numeric"
        aria-label={`Jump to line, 1 to ${total}`}
        aria-invalid={target === null}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          // A committing Enter from an IME arrives as keyCode 229 in WebKit.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            if (target === null) return;
            setDraft(null);
            onJump(target);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
          }
        }}
        className={styles.lineJumpInput}
        style={{ width: `${String(lineCount).length + 3}ch` }}
      />
      of {total}
    </span>
  );
};

export default LineJumpField;

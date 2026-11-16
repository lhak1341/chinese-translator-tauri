import React from 'react';

/** Each variable's @lhak/style hue (user decision, adoption ticket 19). Nine variables share
 * eight hues and green goes unused: C and Z are both cyan and E and Y both blue, told apart by
 * the letter itself. */
export const PATTERN_VARIABLE_COLORS: Record<string, string> = {
  X: 'var(--lk-red)',
  Y: 'var(--lk-blue)',
  Z: 'var(--lk-cyan)',
  A: 'var(--lk-orange)',
  B: 'var(--lk-purple)',
  C: 'var(--lk-cyan)',
  D: 'var(--lk-pink)',
  E: 'var(--lk-blue)',
  '#': 'var(--lk-yellow)',
};

export const highlightPatternVariables = (text: string): React.ReactNode => {
  const parts = text.split(/([A-Z#])/);
  return parts.map((part, index) => {
    if (part.length === 1 && /[A-Z#]/.test(part)) {
      const color = PATTERN_VARIABLE_COLORS[part] || 'var(--lk-green)';
      return (
        <span key={index} style={{ color, fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

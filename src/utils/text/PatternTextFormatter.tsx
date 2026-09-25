import React from 'react';

export const PATTERN_VARIABLE_COLORS: Record<string, string> = {
  X: '#dc2626',
  Y: '#16a34a',
  Z: '#0891b2',
  A: '#ea580c',
  B: '#7c3aed',
  C: '#0d9488',
  D: '#db2777',
  E: '#2563eb',
  '#': '#ca8a04',
};

export const highlightPatternVariables = (text: string): React.ReactNode => {
  const parts = text.split(/([A-Z#])/);
  return parts.map((part, index) => {
    if (part.length === 1 && /[A-Z#]/.test(part)) {
      const color = PATTERN_VARIABLE_COLORS[part] || '#059669';
      return (
        <span key={index} style={{ color, fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

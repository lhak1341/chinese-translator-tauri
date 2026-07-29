import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { highlightPatternVariables } from '../text/PatternTextFormatter';

// jsdom normalizes inline hex colors to rgb() on readback — assert against the normalized form.
const RGB = { X: 'rgb(220, 38, 38)', Y: 'rgb(22, 163, 74)', DEFAULT: 'rgb(5, 150, 105)' };

describe('highlightPatternVariables', () => {
  test('wraps each pattern variable letter in a colored span', () => {
    const { container } = render(<>{highlightPatternVariables('X的Y上')}</>);
    const spans = container.querySelectorAll('span');

    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('X');
    expect(spans[0].style.color).toBe(RGB.X);
    expect(spans[1].textContent).toBe('Y');
    expect(spans[1].style.color).toBe(RGB.Y);
    expect(container.textContent).toBe('X的Y上');
  });

  test('falls back to the default green for an uppercase letter with no explicit color', () => {
    // 'M' is not in PATTERN_VARIABLE_COLORS (X, Y, Z, A, B, C, D, E only).
    const { container } = render(<>{highlightPatternVariables('M')}</>);
    expect(container.querySelector('span')?.style.color).toBe(RGB.DEFAULT);
  });

  test('leaves text with no uppercase letters unwrapped', () => {
    const { container } = render(<>{highlightPatternVariables('没有变量')}</>);
    expect(container.querySelectorAll('span')).toHaveLength(0);
    expect(container.textContent).toBe('没有变量');
  });
});

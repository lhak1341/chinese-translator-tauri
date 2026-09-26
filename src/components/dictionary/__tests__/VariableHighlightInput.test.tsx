import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { VariableHighlightInput, markVariables } from '../VariableHighlightInput';
import { PATTERN_VARIABLE_COLORS } from '../../../utils/text';

function variablesIn(text: string): string[] {
  const { container } = render(<>{markVariables(text)}</>);
  return Array.from(container.querySelectorAll('[data-variable]')).map((n) => n.textContent ?? '');
}

describe('markVariables', () => {
  test('marks the variables of a Chinese pattern source', () => {
    expect(variablesIn('可X一把Y')).toEqual(['X', 'Y']);
    expect(variablesIn('第#章')).toEqual(['#']);
  });

  test('marks standalone variables in a Vietnamese translation, not capitals fused to words', () => {
    expect(variablesIn('khả dĩ X bả Y')).toEqual(['X', 'Y']);
    expect(variablesIn('Yến gặp X')).toEqual(['X']);
    expect(variablesIn('Lý Thế Dân')).toEqual([]);
  });

  test('colours each variable with its pattern colour and keeps the text intact', () => {
    const { container } = render(<>{markVariables('可X一把Y')}</>);
    expect(container.textContent).toBe('可X一把Y');
    const x = container.querySelector('[data-variable="X"]') as HTMLElement;
    expect(x.style.color).not.toBe('');
    expect(PATTERN_VARIABLE_COLORS.X).toBeDefined();
  });
});

describe('VariableHighlightInput', () => {
  test('draws a coloured copy over the input when highlighting', () => {
    const { container } = render(
      <VariableHighlightInput aria-label="Source" value="可X一把Y" highlight onChange={vi.fn()} />
    );
    const mirror = container.querySelector('[aria-hidden="true"]');
    expect(mirror?.textContent).toBe('可X一把Y');
    expect(screen.getByLabelText('Source')).toHaveValue('可X一把Y');
  });

  test('is a plain input when not highlighting', () => {
    const { container } = render(
      <VariableHighlightInput
        aria-label="Source"
        value="李世民"
        highlight={false}
        onChange={vi.fn()}
      />
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

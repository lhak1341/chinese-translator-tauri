/**
 * Tests for WordTransformToolbar — capitalize/reorder button toolbar rendered inside
 * DictionaryEntry's translation field. Previously untested (architecture review
 * 2026-07-17, follow-up to candidate 1). Uses the real wordTransformHelpers functions
 * (also untested until now) rather than mocking them — this component IS their test
 * surface.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WordTransformToolbar } from '../WordTransformToolbar';

function renderToolbar(value: string, disabled = false) {
  const onChange = vi.fn();
  render(<WordTransformToolbar value={value} onChange={onChange} disabled={disabled} />);
  return { onChange };
}

describe('WordTransformToolbar — capitalize/lowercase buttons', () => {
  test('are disabled when the value is empty or whitespace-only', () => {
    renderToolbar('   ');
    expect(
      screen.getByRole('button', { name: 'Capitalize all words (Title Case)' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lowercase all words' })).toBeDisabled();
  });

  test('AAAA applies title case to every word', () => {
    const { onChange } = renderToolbar('hello world');
    fireEvent.click(screen.getByRole('button', { name: 'Capitalize all words (Title Case)' }));
    expect(onChange).toHaveBeenCalledWith('Hello World');
  });

  test('aaaa lowercases the whole string', () => {
    const { onChange } = renderToolbar('HELLO World');
    fireEvent.click(screen.getByRole('button', { name: 'Lowercase all words' }));
    expect(onChange).toHaveBeenCalledWith('hello world');
  });

  test('---a capitalizes all words except the last', () => {
    const { onChange } = renderToolbar('hello beautiful world');
    fireEvent.click(
      screen.getByRole('button', { name: 'Capitalize all words except the last one' })
    );
    expect(onChange).toHaveBeenCalledWith('Hello Beautiful world');
  });

  test('--aa capitalizes all words except the last two', () => {
    const { onChange } = renderToolbar('hello beautiful world');
    fireEvent.click(
      screen.getByRole('button', { name: 'Capitalize all words except the last two' })
    );
    expect(onChange).toHaveBeenCalledWith('Hello beautiful world');
  });

  test('-aaa capitalizes all words except the last three', () => {
    const { onChange } = renderToolbar('one two three four');
    fireEvent.click(
      screen.getByRole('button', { name: 'Capitalize all words except the last three' })
    );
    expect(onChange).toHaveBeenCalledWith('One two three four');
  });
});

describe('WordTransformToolbar — move-to-front buttons gated by word count', () => {
  test('all 3 move buttons are disabled for a single-word value', () => {
    renderToolbar('solo');
    expect(screen.getByRole('button', { name: 'Move last word to beginning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 2 words to beginning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 3 words to beginning' })).toBeDisabled();
  });

  test('only ←1 is enabled for a 2-word value', () => {
    renderToolbar('hello world');
    expect(screen.getByRole('button', { name: 'Move last word to beginning' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 2 words to beginning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 3 words to beginning' })).toBeDisabled();
  });

  test('←1 and ←2 are enabled for a 3-word value, ←3 stays disabled', () => {
    renderToolbar('one two three');
    expect(screen.getByRole('button', { name: 'Move last word to beginning' })).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move last 2 words to beginning' })
    ).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 3 words to beginning' })).toBeDisabled();
  });

  test('all 3 move buttons are enabled for a 4-word value', () => {
    renderToolbar('one two three four');
    expect(screen.getByRole('button', { name: 'Move last word to beginning' })).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move last 2 words to beginning' })
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move last 3 words to beginning' })
    ).not.toBeDisabled();
  });

  test('←1 moves the last word to the front', () => {
    const { onChange } = renderToolbar('hello beautiful world');
    fireEvent.click(screen.getByRole('button', { name: 'Move last word to beginning' }));
    expect(onChange).toHaveBeenCalledWith('world hello beautiful');
  });

  test('←2 moves the last two words to the front, preserving their order', () => {
    const { onChange } = renderToolbar('one two three four');
    fireEvent.click(screen.getByRole('button', { name: 'Move last 2 words to beginning' }));
    expect(onChange).toHaveBeenCalledWith('three four one two');
  });
});

describe('WordTransformToolbar — disabled prop overrides everything', () => {
  test('disables every button regardless of text content or word count', () => {
    renderToolbar('one two three four', true);
    expect(
      screen.getByRole('button', { name: 'Capitalize all words (Title Case)' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lowercase all words' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last word to beginning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 2 words to beginning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move last 3 words to beginning' })).toBeDisabled();
  });
});

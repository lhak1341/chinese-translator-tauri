/**
 * Tests for SemanticTypePicker — semantic type badge picker + per-variable type constraint
 * toggles, rendered inside DictionaryEntry. Previously untested (architecture review
 * 2026-07-17, follow-up to candidate 1). Real classifyDictionaryId and SemanticTypes
 * constants are used (not mocked) — this is a pure presentational component with no
 * separate hook.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SemanticTypePicker } from '../SemanticTypePicker';

function renderPicker(overrides: Record<string, any> = {}) {
  const onSemanticTypeChange = vi.fn();
  const onAllowedVariableTypesChange = vi.fn();
  const props = {
    semanticType: '' as const,
    onSemanticTypeChange,
    allowedVariableTypes: {},
    onAllowedVariableTypesChange,
    activeDictionary: 'properNouns',
    source: '',
    isSaving: false,
    ...overrides,
  };
  render(<SemanticTypePicker {...props} />);
  return { onSemanticTypeChange, onAllowedVariableTypesChange };
}

describe('SemanticTypePicker — visibility gate', () => {
  test('renders nothing for a dictionary that does not support semantic metadata', () => {
    renderPicker({ activeDictionary: 'characters' });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  test('renders "Semantic Type" label for a non-patterns dictionary', () => {
    renderPicker({ activeDictionary: 'phrases' });
    expect(screen.getByText('Semantic Type')).toBeInTheDocument();
  });

  test('renders "Output type" label and explanatory text for a patterns dictionary', () => {
    renderPicker({ activeDictionary: 'patterns' });
    expect(screen.getByText('Output type')).toBeInTheDocument();
    expect(screen.getByText(/Blank = any type/)).toBeInTheDocument();
  });
});

describe('SemanticTypePicker — semantic type badges', () => {
  test('marks "None" as checked when semanticType is empty', () => {
    renderPicker();
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking a canonical badge selects that semantic type', () => {
    const { onSemanticTypeChange } = renderPicker();
    fireEvent.click(screen.getByText('LOC'));
    expect(onSemanticTypeChange).toHaveBeenCalledWith('location');
  });

  test('clicking the already-selected badge clears the semantic type', () => {
    const { onSemanticTypeChange } = renderPicker({ semanticType: 'location' });
    fireEvent.click(screen.getByText('LOC'));
    expect(onSemanticTypeChange).toHaveBeenCalledWith('');
  });

  test('Enter/Space keyboard activation dispatches the same as a click', () => {
    const { onSemanticTypeChange } = renderPicker();
    fireEvent.keyDown(screen.getByText('CON'), { key: 'Enter' });
    expect(onSemanticTypeChange).toHaveBeenCalledWith('concept');

    onSemanticTypeChange.mockClear();
    fireEvent.keyDown(screen.getByText('OBJ'), { key: ' ' });
    expect(onSemanticTypeChange).toHaveBeenCalledWith('object');
  });

  test('isSaving=true disables interaction — click does not dispatch', () => {
    const { onSemanticTypeChange } = renderPicker({ isSaving: true });
    fireEvent.click(screen.getByText('LOC'));
    expect(onSemanticTypeChange).not.toHaveBeenCalled();
    expect(screen.getByText('LOC')).toHaveAttribute('tabindex', '-1');
  });
});

describe('SemanticTypePicker — $X/$Y variable-ref badges (patterns only)', () => {
  test('shows only the $X badge when source contains X but not Y', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X的手上' });
    expect(screen.getByText('$X')).toBeInTheDocument();
    expect(screen.queryByText('$Y')).not.toBeInTheDocument();
  });

  test('shows both $X and $Y badges when source contains both variables', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X和Y' });
    expect(screen.getByText('$X')).toBeInTheDocument();
    expect(screen.getByText('$Y')).toBeInTheDocument();
  });

  test('does not show ref badges for a non-patterns dictionary even if source contains X', () => {
    renderPicker({ activeDictionary: 'phrases', source: 'X的手上' });
    expect(screen.queryByText('$X')).not.toBeInTheDocument();
  });

  test('selecting a $X ref badge dispatches it as the semantic type', () => {
    const { onSemanticTypeChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X的手上',
    });
    fireEvent.click(screen.getByText('$X'));
    expect(onSemanticTypeChange).toHaveBeenCalledWith('$X');
  });
});

describe('SemanticTypePicker — per-variable allowed-type constraints (patterns only)', () => {
  test('is not rendered for a non-patterns dictionary', () => {
    renderPicker({ activeDictionary: 'phrases', source: 'X的手上' });
    expect(screen.queryByText(/X allowed types/)).not.toBeInTheDocument();
  });

  test('renders a section per variable present in the source', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X和Y' });
    expect(screen.getByText('X allowed types')).toBeInTheDocument();
    expect(screen.getByText('Y allowed types')).toBeInTheDocument();
  });

  test('shows the "no constraints" hint when no types are toggled for a variable', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X的手上' });
    expect(screen.getByText('No constraint — matches any type')).toBeInTheDocument();
  });

  test('toggling a type ON adds it to that variable’s allowed list', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X的手上',
      allowedVariableTypes: {},
    });
    fireEvent.click(screen.getByTitle('Add Character constraint for X'));
    expect(onAllowedVariableTypesChange).toHaveBeenCalledWith({ X: ['character'] });
  });

  test('toggling the last active type OFF deletes the variable key entirely', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X的手上',
      allowedVariableTypes: { X: ['character'] },
    });
    fireEvent.click(screen.getByTitle('Remove Character constraint for X'));
    expect(onAllowedVariableTypesChange).toHaveBeenCalledWith({});
  });

  test('toggling one of several active types OFF keeps the others', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X的手上',
      allowedVariableTypes: { X: ['character', 'location'] },
    });
    fireEvent.click(screen.getByTitle('Remove Character constraint for X'));
    expect(onAllowedVariableTypesChange).toHaveBeenCalledWith({ X: ['location'] });
  });
});

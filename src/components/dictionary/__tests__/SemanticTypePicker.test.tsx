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
    allowAsPatternVariable: true,
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

  test('hides the type row for a phrase with VAR off — the type only matters once VAR is on', () => {
    renderPicker({ activeDictionary: 'phrases', allowAsPatternVariable: false });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  test('shows the type row for a proper noun with VAR off — always usable as a variable', () => {
    renderPicker({ activeDictionary: 'properNouns-f_X', allowAsPatternVariable: false });
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  test("keeps a pattern's X/Y rows with VAR off, hiding only its Output row", () => {
    renderPicker({ activeDictionary: 'patterns', allowAsPatternVariable: false, source: 'X的Y' });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'X accepts' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Y accepts' })).toBeInTheDocument();
  });

  test('labels the row "Type" for a non-patterns dictionary', () => {
    renderPicker({ activeDictionary: 'phrases' });
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  test('labels the row "Output" for a patterns dictionary, explained on hover', () => {
    renderPicker({ activeDictionary: 'patterns' });
    expect(screen.getByText('Output')).toHaveAttribute(
      'title',
      'The type this pattern produces when reused elsewhere'
    );
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

  test('Cmd/Ctrl-Enter is left to the Add form as Save — it does not toggle', () => {
    const { onSemanticTypeChange } = renderPicker();
    fireEvent.keyDown(screen.getByText('CON'), { key: 'Enter', metaKey: true });
    fireEvent.keyDown(screen.getByText('CON'), { key: 'Enter', ctrlKey: true });
    expect(onSemanticTypeChange).not.toHaveBeenCalled();
  });

  test('with focus in the type group, digit N sets the Nth type, again clears; 0 is None', () => {
    const { onSemanticTypeChange } = renderPicker();
    const group = screen.getByRole('radiogroup', { name: 'Semantic type' });
    fireEvent.keyDown(screen.getByText('LOC'), { key: '5' });
    expect(onSemanticTypeChange).toHaveBeenLastCalledWith('concept');
    fireEvent.keyDown(group, { key: '0' });
    expect(onSemanticTypeChange).toHaveBeenLastCalledWith('');
  });

  test('digit of the already-selected type clears it; modified or out-of-range digits do nothing', () => {
    const { onSemanticTypeChange } = renderPicker({ semanticType: 'character' });
    const group = screen.getByRole('radiogroup', { name: 'Semantic type' });
    fireEvent.keyDown(group, { key: '1' });
    expect(onSemanticTypeChange).toHaveBeenLastCalledWith('');
    onSemanticTypeChange.mockClear();
    fireEvent.keyDown(group, { key: '2', metaKey: true });
    fireEvent.keyDown(group, { key: '9' });
    expect(onSemanticTypeChange).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('group', { name: 'X accepts' })).not.toBeInTheDocument();
  });

  test('renders a section per variable present in the source', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X和Y' });
    expect(screen.getByRole('group', { name: 'X accepts' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Y accepts' })).toBeInTheDocument();
  });

  test('"any" is checked while no type is ticked for a variable', () => {
    renderPicker({ activeDictionary: 'patterns', source: 'X的手上' });
    expect(screen.getByTitle('X accepts any type')).toHaveAttribute('aria-checked', 'true');
  });

  test('"any" is unchecked once a type is ticked, and clicking it clears the variable', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X和Y',
      allowedVariableTypes: { X: ['location'], Y: ['object'] },
    });
    const any = screen.getByTitle('X accepts any type');
    expect(any).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(any);
    expect(onAllowedVariableTypesChange).toHaveBeenCalledWith({ Y: ['object'] });
  });

  test('digit 0 in a variable row clears it back to any', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X和Y',
      allowedVariableTypes: { X: ['location'] },
    });
    fireEvent.keyDown(screen.getByRole('group', { name: 'X accepts' }), { key: '0' });
    expect(onAllowedVariableTypesChange).toHaveBeenLastCalledWith({});
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

describe('SemanticTypePicker — digit keys in pattern groups', () => {
  test('$X follows the six types as digit 7', () => {
    const { onSemanticTypeChange } = renderPicker({ activeDictionary: 'patterns', source: 'X城' });
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Semantic type' }), { key: '7' });
    expect(onSemanticTypeChange).toHaveBeenLastCalledWith('$X');
  });

  test('in a variable constraint group, digit N toggles the Nth type for that variable', () => {
    const { onAllowedVariableTypesChange } = renderPicker({
      activeDictionary: 'patterns',
      source: 'X和Y',
      allowedVariableTypes: { Y: ['character'] },
    });
    fireEvent.keyDown(screen.getByRole('group', { name: 'X accepts' }), { key: '3' });
    expect(onAllowedVariableTypesChange).toHaveBeenLastCalledWith({
      Y: ['character'],
      X: ['location'],
    });
    fireEvent.keyDown(screen.getByRole('group', { name: 'Y accepts' }), { key: '1' });
    expect(onAllowedVariableTypesChange).toHaveBeenLastCalledWith({});
  });

  test('isSaving swallows digits without dispatching', () => {
    const { onSemanticTypeChange } = renderPicker({ isSaving: true });
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Semantic type' }), { key: '1' });
    expect(onSemanticTypeChange).not.toHaveBeenCalled();
  });
});

describe('SemanticTypePicker — one Tab stop per group', () => {
  const tabbable = () =>
    screen
      .getAllByRole('radio')
      .concat(screen.queryAllByRole('checkbox'))
      .filter((el) => el.tabIndex === 0);

  test('the type group is one Tab stop: None when nothing is selected', () => {
    renderPicker();
    expect(tabbable().map((el) => el.textContent)).toEqual(['None']);
  });

  test('the Tab stop is the selected type', () => {
    renderPicker({ semanticType: 'location' });
    expect(tabbable().map((el) => el.textContent)).toEqual(['LOC']);
  });

  test('each constraint group adds one Tab stop: its first checked type, else "any"', () => {
    renderPicker({
      activeDictionary: 'patterns',
      source: 'X和Y',
      allowedVariableTypes: { Y: ['object', 'location'] },
    });
    const stops = tabbable();
    expect(stops).toHaveLength(3);
    expect(stops.map((el) => el.getAttribute('title'))).toEqual([
      'No semantic type',
      'X accepts any type',
      'Remove Location constraint for Y',
    ]);
  });

  test('arrow keys move focus within the group, wrapping, without selecting', () => {
    const { onSemanticTypeChange } = renderPicker();
    const none = screen.getByRole('radio', { name: 'None' });
    none.focus();
    fireEvent.keyDown(none, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveTextContent('CHA');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toHaveTextContent('OBJ');
    expect(onSemanticTypeChange).not.toHaveBeenCalled();
  });
});

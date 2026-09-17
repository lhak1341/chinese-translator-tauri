/**
 * Render-wiring tests for AddEntryBar — a thin shell over `useDictionaryEntryForm`, the
 * same hook the Translator's modal uses (its own logic is covered by
 * `useDictionaryEntryForm.test.ts`). What is specific to the bar, and so what is tested
 * here, is the part the reading loop depends on: it names the dictionary the entry lands
 * in, Escape dismisses it, and a successful save closes it.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AddEntryBar from '../AddEntryBar';

const { formStateRef } = vi.hoisted(() => ({
  formStateRef: { current: null as unknown as ReturnType<typeof makeFormState> },
}));

vi.mock('../../../hooks/useDictionaryEntryForm', () => ({
  useDictionaryEntryForm: () => formStateRef.current,
}));

vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ updateEntry: vi.fn(), addEntry: vi.fn(), dictionaries: {} }),
}));

function makeFormState(overrides: Record<string, unknown> = {}) {
  return {
    source: '太岳山脉',
    translation: '',
    activeDictionary: 'properNouns-f_DuongThan',
    availableDictionaries: [
      ['properNouns', { label: 'Proper Nouns' }],
      ['properNouns-f_DuongThan', { label: 'Proper Nouns - f_DuongThan' }],
    ],
    error: '',
    isFormValid: true,
    isSaving: false,
    sourceInputRef: { current: null },
    translationInputRef: { current: null },
    handleSourceChange: vi.fn(),
    handleTranslationFocus: vi.fn(),
    handleSubmit: vi.fn().mockResolvedValue(true),
    setTranslation: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  formStateRef.current = makeFormState();
});

describe('AddEntryBar', () => {
  test('names the dictionary the entry will land in', () => {
    render(
      <AddEntryBar source="太岳山脉" dictionaryId="properNouns-f_DuongThan" onClose={vi.fn()} />
    );
    expect(screen.getByText('Proper Nouns - f_DuongThan')).toBeInTheDocument();
  });

  test('falls back to the dictionary id before the label list has loaded', () => {
    formStateRef.current = makeFormState({ availableDictionaries: [] });
    render(
      <AddEntryBar source="太岳山脉" dictionaryId="properNouns-f_DuongThan" onClose={vi.fn()} />
    );
    expect(screen.getByText('properNouns-f_DuongThan')).toBeInTheDocument();
  });

  test('shows the term and an input for the translation', () => {
    render(<AddEntryBar source="太岳山脉" dictionaryId="properNouns" onClose={vi.fn()} />);
    expect(screen.getByLabelText('Term')).toHaveValue('太岳山脉');
    expect(screen.getByLabelText('Translation')).toBeInTheDocument();
  });

  test('Escape dismisses it, even with focus outside the bar', () => {
    const onClose = vi.fn();
    render(<AddEntryBar source="太岳山脉" dictionaryId="properNouns" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape does nothing mid-save', () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ isSaving: true });
    render(<AddEntryBar source="太岳山脉" dictionaryId="properNouns" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a successful save closes the bar', async () => {
    const onClose = vi.fn();
    render(<AddEntryBar source="太岳山脉" dictionaryId="properNouns" onClose={onClose} />);
    fireEvent.submit(screen.getByLabelText('Add dictionary entry'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('a rejected save leaves the bar open', async () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ handleSubmit: vi.fn().mockResolvedValue(false) });
    render(<AddEntryBar source="太岳山脉" dictionaryId="properNouns" onClose={onClose} />);
    fireEvent.submit(screen.getByLabelText('Add dictionary entry'));
    await waitFor(() => expect(formStateRef.current.handleSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * Render-wiring tests for DictionaryEntry.tsx — thin JSX shell over useDictionaryEntryForm
 * (the hook's own logic is covered by useDictionaryEntryForm.test.ts). This file mocks the
 * hook entirely and verifies DictionaryEntry renders the right thing for a given form state,
 * and dispatches to the right handler on each interaction (architecture review 2026-07-17,
 * follow-up to candidate 1).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import DictionaryEntry, { shortlistKeyTarget } from '../DictionaryEntry';

const { formStateRef } = vi.hoisted(() => ({ formStateRef: { current: null as any } }));

vi.mock('../../../hooks/useDictionaryEntryForm', () => ({
  useDictionaryEntryForm: () => formStateRef.current,
}));

vi.mock('../DictionaryContext', () => ({
  useDictionary: () => ({
    updateEntry: vi.fn(),
    addEntry: vi.fn(),
    dictionaries: {},
    unreadDictionaryIds: [],
  }),
}));

vi.mock('../SemanticTypePicker', () => ({
  SemanticTypePicker: () => <div data-testid="semantic-type-picker" />,
}));

vi.mock('../WordTransformToolbar', () => ({
  WordTransformToolbar: () => <div data-testid="word-transform-toolbar" />,
}));

function makeFormState(overrides: Record<string, any> = {}) {
  return {
    source: '',
    translation: '',
    activeDictionary: 'properNouns',
    allowAsPatternVariable: false,
    semanticType: '',
    allowedVariableTypes: {},
    availableDictionaries: [
      ['properNouns', { label: 'General Purpose Dictionary' }],
      ['phrases', { label: 'Phrases' }],
    ],
    error: '',
    isFormValid: true,
    showCharacterValidation: false,
    showPatternValidation: false,
    existingEntry: null,
    showExistingEntryNotification: false,
    roughGlossReference: '',
    isSaving: false,
    sourceInputRef: { current: null },
    translationInputRef: { current: null },
    handleDictionaryChange: vi.fn(),
    selectDictionary: vi.fn(),
    handleSourceChange: vi.fn(),
    handleTranslationFocus: vi.fn(),
    handleDismissNotification: vi.fn(),
    handleUseExistingTranslation: vi.fn(),
    handleSubmit: vi.fn().mockResolvedValue(true),
    setTranslation: vi.fn(),
    setAllowAsPatternVariable: vi.fn(),
    setSemanticType: vi.fn(),
    setAllowedVariableTypes: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  formStateRef.current = makeFormState();
});

describe('DictionaryEntry — title', () => {
  test('shows "New Entry" when no entry prop is given', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('New Entry')).toBeInTheDocument();
  });

  test('shows "Edit Entry" when an entry prop is given', () => {
    render(
      <DictionaryEntry
        onClose={vi.fn()}
        selectedDictionary="properNouns"
        entry={{ source: '你好', translation: 'xin chào' }}
      />
    );
    expect(screen.getByText('Edit Entry')).toBeInTheDocument();
  });
});

describe('DictionaryEntry — dictionary selector', () => {
  test('is hidden when no quick-add view is given', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.queryByLabelText('Dictionary')).not.toBeInTheDocument();
  });

  test('renders availableDictionaries options when a quick-add view is given, even a null one', () => {
    render(
      <DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" quickAddView={null} />
    );
    const select = screen.getByLabelText('Dictionary') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Phrases')).toBeInTheDocument();
  });

  test('dropdown change dispatches to handleDictionaryChange', () => {
    render(
      <DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" quickAddView={null} />
    );
    fireEvent.change(screen.getByLabelText('Dictionary'), { target: { value: 'phrases' } });
    expect(formStateRef.current.handleDictionaryChange).toHaveBeenCalled();
  });
});

describe('DictionaryEntry — existing-entry notification', () => {
  test('is not rendered when showExistingEntryNotification is false', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.queryByText(/Already exists|Found in/)).not.toBeInTheDocument();
  });

  test('shows "Already exists" when the match is in the currently selected dictionary', () => {
    formStateRef.current = makeFormState({
      showExistingEntryNotification: true,
      existingEntry: {
        dictionaryId: 'properNouns',
        dictionaryName: 'General Purpose Dictionary',
        source: '你好',
        translation: 'xin chào',
        isSelectedDictionary: true,
      },
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('Already exists in this dictionary')).toBeInTheDocument();
  });

  test('shows "Found in X" with a use-this-translation button when the match is elsewhere', () => {
    formStateRef.current = makeFormState({
      showExistingEntryNotification: true,
      existingEntry: {
        dictionaryId: 'phrases',
        dictionaryName: 'Phrases',
        source: '你好',
        translation: 'xin chào',
        isSelectedDictionary: false,
      },
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('Found in Phrases')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Use this translation'));
    expect(formStateRef.current.handleUseExistingTranslation).toHaveBeenCalled();
  });

  test('dismiss button dispatches to handleDismissNotification', () => {
    formStateRef.current = makeFormState({
      showExistingEntryNotification: true,
      existingEntry: {
        dictionaryId: 'phrases',
        dictionaryName: 'Phrases',
        source: '你好',
        translation: 'xin chào',
        isSelectedDictionary: false,
      },
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    fireEvent.click(screen.getByTitle('Dismiss'));
    expect(formStateRef.current.handleDismissNotification).toHaveBeenCalled();
  });
});

describe('DictionaryEntry — validation banners', () => {
  test('character validation banner only shows for the characters dictionary', () => {
    formStateRef.current = makeFormState({
      activeDictionary: 'characters',
      showCharacterValidation: true,
      source: '你好',
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="characters" />);
    expect(screen.getByText('Must be exactly 1 character (got 2).')).toBeInTheDocument();
  });

  test('character validation banner is hidden when showCharacterValidation is false', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.queryByText(/Must be exactly 1 character/)).not.toBeInTheDocument();
  });

  test('pattern validation banner only shows for a patterns dictionary', () => {
    formStateRef.current = makeFormState({
      activeDictionary: 'patterns',
      showPatternValidation: true,
      source: '这Y上',
      translation: 'trên Y này',
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="patterns" />);
    expect(
      screen.getByText(
        'Source has "Y" but no "X" — add "X" first, or remove "Y" for a no-variable pattern.'
      )
    ).toBeInTheDocument();
  });
});

describe('DictionaryEntry — save button state', () => {
  test('is disabled when the form is invalid', () => {
    formStateRef.current = makeFormState({ isFormValid: false });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });

  test('shows "Saving..." and is disabled while isSaving is true', () => {
    formStateRef.current = makeFormState({ isSaving: true });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('Saving...')).toBeDisabled();
  });
});

describe('DictionaryEntry — submit / cancel / escape', () => {
  test('calls onClose when handleSubmit resolves true', async () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ handleSubmit: vi.fn().mockResolvedValue(true) });
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('does not call onClose when handleSubmit resolves false', async () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ handleSubmit: vi.fn().mockResolvedValue(false) });
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await vi.waitFor(() => expect(formStateRef.current.handleSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Cmd-Enter anywhere in the form saves', async () => {
    const onClose = vi.fn();
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);

    fireEvent.keyDown(screen.getByText('Cancel'), { key: 'Enter', metaKey: true });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(formStateRef.current.handleSubmit).toHaveBeenCalledTimes(1);
  });

  test('Cmd-Enter does nothing while the form is invalid', () => {
    formStateRef.current = makeFormState({ isFormValid: false });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);

    fireEvent.keyDown(screen.getByLabelText('Source Text'), { key: 'Enter', ctrlKey: true });
    expect(formStateRef.current.handleSubmit).not.toHaveBeenCalled();
  });

  test('Cancel button calls onClose directly, disabled while saving', () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ isSaving: true });
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  test('Escape key closes the dialog unless saving', () => {
    const onClose = vi.fn();
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('Escape key does nothing while saving', () => {
    const onClose = vi.fn();
    formStateRef.current = makeFormState({ isSaving: true });
    render(<DictionaryEntry onClose={onClose} selectedDictionary="properNouns" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DictionaryEntry — pattern/phrase metadata checkboxes', () => {
  test('allowAsPatternVariable checkbox is hidden for a plain properNouns dictionary', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.queryByLabelText('Usable as X/Y')).not.toBeInTheDocument();
  });

  test('allowAsPatternVariable checkbox shows for phrases', () => {
    formStateRef.current = makeFormState({ activeDictionary: 'phrases' });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="phrases" />);
    expect(screen.getByLabelText('Usable as X/Y')).toBeInTheDocument();
  });

  test('allowAsPatternVariable checkbox shows for a patterns dictionary', () => {
    formStateRef.current = makeFormState({ activeDictionary: 'patterns' });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="patterns" />);
    expect(screen.getByLabelText('Usable as X/Y')).toBeInTheDocument();
  });
});

describe('DictionaryEntry — revert to character-only gloss', () => {
  test('no reference shown when roughGlossReference is empty (e.g. editing an existing entry)', () => {
    formStateRef.current = makeFormState({ roughGlossReference: '', translation: 'hello' });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.queryByText('Use')).not.toBeInTheDocument();
  });

  test('use button disabled when Translation already matches the gloss (no rule applied)', () => {
    formStateRef.current = makeFormState({
      roughGlossReference: 'You Good',
      translation: 'You Good',
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('You Good')).toBeInTheDocument();
    expect(screen.getByText('Use')).toBeDisabled();
  });

  test('use button enabled and reverts Translation when a rule changed it', () => {
    formStateRef.current = makeFormState({
      roughGlossReference: 'You Good',
      translation: 'Good You',
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);

    const revertButton = screen.getByText('Use');
    fireEvent.click(revertButton);

    expect(formStateRef.current.setTranslation).toHaveBeenCalledWith('You Good');
  });

  test('Option-G uses the gloss from anywhere in the form', () => {
    formStateRef.current = makeFormState({
      roughGlossReference: 'You Good',
      translation: 'Good You',
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);

    fireEvent.keyDown(screen.getByLabelText('Source Text'), {
      code: 'KeyG',
      key: '©',
      altKey: true,
    });

    expect(formStateRef.current.setTranslation).toHaveBeenCalledWith('You Good');
  });
});

describe('DictionaryEntry — reuse toggle', () => {
  test('is the next Tab stop after the translation, so Tab then Space ticks it', () => {
    formStateRef.current = makeFormState({ activeDictionary: 'phrases' });
    const { container } = render(
      <DictionaryEntry onClose={vi.fn()} selectedDictionary="phrases" quickAddView={null} />
    );
    const tabbable = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, button, [tabindex]')
    ).filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);
    const next = tabbable[tabbable.indexOf(screen.getByLabelText('Translation')) + 1];
    expect(next).toBe(screen.getByLabelText('Usable as X/Y'));
  });
});

describe('DictionaryEntry — footer message', () => {
  test('shows a hint when there is nothing to report', () => {
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="properNouns" />);
    expect(screen.getByText('Esc cancels')).toBeInTheDocument();
  });

  test('a pattern validation error replaces the hint, next to Save', () => {
    formStateRef.current = makeFormState({
      activeDictionary: 'patterns',
      source: '可X一把Y',
      translation: 'khả dĩ X bả',
      showPatternValidation: true,
      isFormValid: false,
    });
    render(<DictionaryEntry onClose={vi.fn()} selectedDictionary="patterns" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Translation is missing "Y".');
    expect(screen.queryByText('Esc cancels')).toBeNull();
  });
});

describe('DictionaryEntry — quick-add shortlist', () => {
  const shortlist = {
    kind: 'properNoun' as const,
    ids: ['properNouns', 'properNouns-_A', 'properNouns-_B'],
  };
  const renderWith = (s = shortlist) =>
    render(
      <DictionaryEntry
        onClose={vi.fn()}
        selectedDictionary="properNouns"
        quickAddView={null}
        shortlist={s}
      />
    );

  test('renders one button per entry, the active one pressed', () => {
    renderWith();
    expect(screen.getByRole('button', { name: /Base/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /_A/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /_B/ })).toBeInTheDocument();
  });

  test('clicking a button selects that dictionary', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: /_B/ }));
    expect(formStateRef.current.selectDictionary).toHaveBeenCalledWith('properNouns-_B');
  });

  test('a shortlist of root alone shows no row', () => {
    renderWith({ kind: 'properNoun', ids: ['properNouns'] });
    expect(screen.queryByRole('group', { name: 'Quick switch' })).toBeNull();
  });

  test('Cmd-3 and Option-3 inside the form select through the shortlist', () => {
    renderWith();
    const input = screen.getByLabelText('Source Text');
    fireEvent.keyDown(input, { code: 'Digit3', key: '3', metaKey: true });
    expect(formStateRef.current.selectDictionary).toHaveBeenLastCalledWith('properNouns-_A');
    fireEvent.keyDown(input, { code: 'Digit3', key: '£', altKey: true });
    expect(formStateRef.current.selectDictionary).toHaveBeenLastCalledWith('properNouns-_B');
  });
});

describe('shortlistKeyTarget', () => {
  const properNoun = { kind: 'properNoun' as const, ids: ['properNouns', 'properNouns-_A'] };
  const pattern = { kind: 'structuralPattern' as const, ids: ['patterns', 'patterns-_A'] };
  const key = (
    code: string,
    mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>>
  ) => ({
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  test('the opening key cycles and wraps', () => {
    expect(shortlistKeyTarget(key('Digit3', { metaKey: true }), properNoun, 'properNouns-_A')).toBe(
      'properNouns'
    );
    expect(shortlistKeyTarget(key('Digit4', { ctrlKey: true }), pattern, 'patterns')).toBe(
      'patterns-_A'
    );
  });

  test('from a dictionary off the shortlist, cycling goes to the first entry', () => {
    expect(shortlistKeyTarget(key('Digit3', { metaKey: true }), properNoun, 'phrases')).toBe(
      'properNouns'
    );
  });

  test("the other kind's key, Shift, or an out-of-range Option digit is not a shortlist key", () => {
    expect(
      shortlistKeyTarget(key('Digit4', { metaKey: true }), properNoun, 'properNouns')
    ).toBeNull();
    expect(
      shortlistKeyTarget(
        key('Digit3', { metaKey: true, shiftKey: true }),
        properNoun,
        'properNouns'
      )
    ).toBeNull();
    expect(
      shortlistKeyTarget(key('Digit5', { altKey: true }), properNoun, 'properNouns')
    ).toBeNull();
  });
});

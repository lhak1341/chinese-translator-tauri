/**
 * Tests for ConfigurationManager's handleCreateDictionary.
 *
 * Covers the fiction-vs-non-fiction create branch added alongside
 * create_fiction_dictionary_pair (ADR-027): fiction IDs must go through the atomic
 * pair command, non-fiction IDs must keep using the plain create command, and a
 * pair-command failure must surface as an error without adding the dictionary to
 * the list.
 *
 * Also covers the DictionaryContext refresh added to close the Cmd-6 staleness gap
 * (architecture review 2026-07-17): every successful create/migrate/rename path must call
 * loadDictionary (and, for rename, applyRename) so DictionaryContext.dictionaries
 * never lags behind what ConfigurationManager just wrote to disk.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';

const { invalidateAppConfig, callRustConfigWrite } = vi.hoisted(() => {
  const invalidateAppConfig = vi.fn();
  // Mirrors the real callRustConfigWrite: run fn, invalidate only on success.
  const callRustConfigWrite = vi.fn(async (fn: () => Promise<{ success: boolean }>) => {
    const result = await fn();
    if (result.success) invalidateAppConfig();
    return result;
  });
  return { invalidateAppConfig, callRustConfigWrite };
});
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    engine: { activeProperNouns: [] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
  invalidateAppConfig,
  callRustConfigWrite,
}));

const loadDictionary = vi.fn();
const applyRename = vi.fn();
vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ loadDictionary, applyRename }),
}));

// No book open: these tests are about creating and renaming dictionaries, not about the
// Reader's authority over the fiction slice. The locked-fiction behavior is covered in
// useDictionaryConfigManagement.binding.test.tsx, where the binding is the subject.
// A fiction dictionary's create and rename belong to the binding context (it also reaches
// book records); what they do there is covered in BookBindingContext.test.tsx.
const bookBinding = vi.hoisted(() => ({
  isBookOpen: false,
  boundFictionDictionary: null,
  openBook: null,
  fictionDictionaries: [],
  createFictionDictionary: vi.fn(),
  renameFictionDictionary: vi.fn(),
}));
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => bookBinding,
}));

const createProperNounsDictionary = vi.fn();
const createFictionDictionaryPair = vi.fn();
const createStructuralPatternsDictionary = vi.fn();
const renameProperNounsDictionary = vi.fn();
const listProperNounsDictionaries = vi.fn();
const listFictionPatternDictionaries = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  loadDictionary.mockResolvedValue(undefined);
  listProperNounsDictionaries.mockResolvedValue({ success: true, dictionaries: [] });
  listFictionPatternDictionaries.mockResolvedValue({ success: true, dictionaries: [] });
  createProperNounsDictionary.mockResolvedValue({ success: true });
  createFictionDictionaryPair.mockResolvedValue({ success: true });
  bookBinding.createFictionDictionary.mockResolvedValue({ success: true });
  bookBinding.renameFictionDictionary.mockResolvedValue({ success: true, filesMoved: true });
  createStructuralPatternsDictionary.mockResolvedValue({ success: true });
  renameProperNounsDictionary.mockResolvedValue({ success: true });

  (window as any).electronAPI = {
    listProperNounsDictionaries,
    listFictionPatternDictionaries,
    createProperNounsDictionary,
    createFictionDictionaryPair,
    createStructuralPatternsDictionary,
    renameProperNounsDictionary,
  };
});

async function openModalAndCreate(name: string) {
  await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
  fireEvent.click(screen.getByText('New'));

  const input = screen.getByPlaceholderText('e.g., HarryPotter, JourneyToTheWest');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByText('Create'));
}

describe('ConfigurationManager handleCreateDictionary', () => {
  test('fiction ID is created by the binding context, as a pair', async () => {
    render(<ConfigurationManager />);
    await openModalAndCreate('f_Test');

    await waitFor(() =>
      expect(bookBinding.createFictionDictionary).toHaveBeenCalledWith('properNouns-f_Test')
    );
    expect(createProperNounsDictionary).not.toHaveBeenCalled();
    expect(createStructuralPatternsDictionary).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('f_Test')).toBeInTheDocument());
  });

  test('non-fiction ID still calls createProperNounsDictionary alone', async () => {
    render(<ConfigurationManager />);
    await openModalAndCreate('Test');

    await waitFor(() =>
      expect(createProperNounsDictionary).toHaveBeenCalledWith('properNouns-Test')
    );
    expect(createFictionDictionaryPair).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledWith('properNouns-Test'));
    // Plain proper-noun create has no paired patterns dict to refresh.
    expect(loadDictionary).not.toHaveBeenCalledWith(expect.stringMatching(/^patterns-/));
  });

  test('create syncs the checkbox from the response active list and invalidates the config cache', async () => {
    createProperNounsDictionary.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-Test'],
    });

    render(<ConfigurationManager />);
    await openModalAndCreate('Test');

    // Regression: creation also activates on disk (Rust-side); the checkbox must reflect
    // that immediately from the response instead of rendering unchecked until a second click.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Test/ })).toBeChecked());
    expect(invalidateAppConfig).toHaveBeenCalled();
  });

  test('create does not force-check when the response omits dictionaries', async () => {
    createProperNounsDictionary.mockResolvedValue({ success: true }); // no `dictionaries` field

    render(<ConfigurationManager />);
    await openModalAndCreate('Test');

    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /Test/ })).not.toBeChecked();
  });

  test('fiction pair failure surfaces an error and does not add the dictionary', async () => {
    bookBinding.createFictionDictionary.mockResolvedValue({
      success: false,
      error: 'Failed to create paired patterns dictionary: disk full. Rolled back.',
    });

    render(<ConfigurationManager />);
    await openModalAndCreate('f_Broken');

    await waitFor(() =>
      expect(
        screen.getByText(/Dictionary creation failed: Failed to create paired patterns dictionary/)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('f_Broken')).not.toBeInTheDocument();
    expect(loadDictionary).not.toHaveBeenCalled();
  });
});

describe('ConfigurationManager — create-modal draft name (architecture review 2026-08-12, candidate #3)', () => {
  // Regression: closeCreateModal() now clears newDictionaryName on every close, not just on
  // a successful create — Cancel used to leave a stale draft behind for the next time the
  // modal opened (the two close paths had silently drifted from each other).
  test('Cancel clears the draft name — reopening shows an empty input, not the stale value', async () => {
    render(<ConfigurationManager />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New'));
    fireEvent.change(screen.getByPlaceholderText('e.g., HarryPotter, JourneyToTheWest'), {
      target: { value: 'Abandoned' },
    });
    fireEvent.click(screen.getByText('Cancel'));

    fireEvent.click(screen.getByText('New'));
    expect(screen.getByPlaceholderText('e.g., HarryPotter, JourneyToTheWest')).toHaveValue('');
  });
});

describe('ConfigurationManager — structural-pattern migration on mount', () => {
  test('creates and loads the missing patterns-f_* dict for a pre-existing fiction proper-noun dict', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-f_Existing'],
    });
    listFictionPatternDictionaries.mockResolvedValue({ success: true, dictionaries: [] });

    render(<ConfigurationManager />);

    await waitFor(() =>
      expect(createStructuralPatternsDictionary).toHaveBeenCalledWith('patterns-f_Existing')
    );
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_Existing');
  });

  test('does not re-create or reload a patterns dict that already exists', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-f_Existing'],
    });
    listFictionPatternDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['patterns-f_Existing'],
    });

    render(<ConfigurationManager />);

    await waitFor(() => expect(screen.getByText('f_Existing')).toBeInTheDocument());
    expect(createStructuralPatternsDictionary).not.toHaveBeenCalled();
    expect(loadDictionary).not.toHaveBeenCalledWith('patterns-f_Existing');
  });
});

describe('ConfigurationManager handleConfirmRename', () => {
  async function openRenameAndConfirm(existingLabel: string, newName: string) {
    await waitFor(() => expect(screen.getByText(existingLabel)).toBeInTheDocument());
    const row = screen.getByText(existingLabel).closest('div');
    const renameButton = row!.querySelector('[title="Rename dictionary"]') as HTMLElement;
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue(existingLabel);
    fireEvent.change(input, { target: { value: newName } });
    fireEvent.click(screen.getByTitle('Confirm rename'));
  }

  test('non-fiction rename swaps the ids in memory as one store operation', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-Old'],
    });

    applyRename.mockResolvedValue(undefined);

    render(<ConfigurationManager />);
    await openRenameAndConfirm('Old', 'New');

    await waitFor(() =>
      expect(renameProperNounsDictionary).toHaveBeenCalledWith('properNouns-Old', 'properNouns-New')
    );
    await waitFor(() =>
      expect(applyRename).toHaveBeenCalledWith([['properNouns-Old', 'properNouns-New']])
    );
    expect(loadDictionary).not.toHaveBeenCalled();
    expect(invalidateAppConfig).toHaveBeenCalled();
  });

  test('fiction rename is done by the binding context, and the row follows it', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-f_Old'],
    });
    listFictionPatternDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['patterns-f_Old'],
    });

    render(<ConfigurationManager />);
    await openRenameAndConfirm('f_Old', 'f_New');

    await waitFor(() =>
      expect(bookBinding.renameFictionDictionary).toHaveBeenCalledWith(
        'properNouns-f_Old',
        'properNouns-f_New'
      )
    );
    expect(renameProperNounsDictionary).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('f_New')).toBeInTheDocument());
  });

  test('rename failure does not touch DictionaryContext', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-Old'],
    });
    renameProperNounsDictionary.mockResolvedValue({
      success: false,
      error: 'Dictionary already exists',
    });

    render(<ConfigurationManager />);
    await openRenameAndConfirm('Old', 'New');

    await waitFor(() =>
      expect(
        screen.getByText(/Dictionary rename failed: Dictionary already exists/)
      ).toBeInTheDocument()
    );
    expect(loadDictionary).not.toHaveBeenCalled();
    expect(applyRename).not.toHaveBeenCalled();
    expect(invalidateAppConfig).not.toHaveBeenCalled();
  });
});

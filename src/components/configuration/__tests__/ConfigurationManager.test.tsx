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
 * loadDictionary (and, for rename, removeDictionaryKey) so DictionaryContext.dictionaries
 * never lags behind what ConfigurationManager just wrote to disk.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';

const { invalidateAppConfig } = vi.hoisted(() => ({ invalidateAppConfig: vi.fn() }));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    engine: { activeProperNouns: [] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
  invalidateAppConfig,
}));

const loadDictionary = vi.fn();
const removeDictionaryKey = vi.fn();
vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ loadDictionary, removeDictionaryKey }),
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
  test('fiction ID calls createFictionDictionaryPair, not the two-call sequence', async () => {
    render(<ConfigurationManager />);
    await openModalAndCreate('f_Test');

    await waitFor(() =>
      expect(createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_Test')
    );
    expect(createProperNounsDictionary).not.toHaveBeenCalled();
    expect(createStructuralPatternsDictionary).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('f_Test')).toBeInTheDocument());
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledWith('properNouns-f_Test'));
    expect(loadDictionary).toHaveBeenCalledWith('patterns-f_Test');
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
    createFictionDictionaryPair.mockResolvedValue({
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

  test('non-fiction rename loads the new ID before removing the old one, in order', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-Old'],
    });

    const callOrder: string[] = [];
    loadDictionary.mockImplementation(async (id: string) => {
      callOrder.push(`load:${id}`);
    });
    removeDictionaryKey.mockImplementation((id: string) => {
      callOrder.push(`remove:${id}`);
    });

    render(<ConfigurationManager />);
    await openRenameAndConfirm('Old', 'New');

    await waitFor(() =>
      expect(renameProperNounsDictionary).toHaveBeenCalledWith('properNouns-Old', 'properNouns-New')
    );
    await waitFor(() => expect(callOrder).toContain('remove:properNouns-Old'));
    expect(callOrder).toEqual(['load:properNouns-New', 'remove:properNouns-Old']);
    expect(invalidateAppConfig).toHaveBeenCalled();
  });

  test('fiction rename also refreshes the paired patterns-f_* dict', async () => {
    listProperNounsDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['properNouns-f_Old'],
    });
    listFictionPatternDictionaries.mockResolvedValue({
      success: true,
      dictionaries: ['patterns-f_Old'],
    });
    renameProperNounsDictionary.mockResolvedValue({ success: true });

    render(<ConfigurationManager />);
    await openRenameAndConfirm('f_Old', 'f_New');

    await waitFor(() =>
      expect(renameProperNounsDictionary).toHaveBeenCalledWith(
        'properNouns-f_Old',
        'properNouns-f_New'
      )
    );
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledWith('patterns-f_New'));
    expect(removeDictionaryKey).toHaveBeenCalledWith('patterns-f_Old');
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
    expect(removeDictionaryKey).not.toHaveBeenCalled();
    expect(invalidateAppConfig).not.toHaveBeenCalled();
  });
});

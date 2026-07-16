/**
 * Tests for ConfigurationManager's handleCreateDictionary.
 *
 * Covers the fiction-vs-non-fiction create branch added alongside
 * create_fiction_dictionary_pair (ADR-027): fiction IDs must go through the atomic
 * pair command, non-fiction IDs must keep using the plain create command, and a
 * pair-command failure must surface as an error without adding the dictionary to
 * the list.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';

vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    engine: { activeProperNouns: [] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));

const createProperNounsDictionary = vi.fn();
const createFictionDictionaryPair = vi.fn();
const createStructuralPatternsDictionary = vi.fn();
const listProperNounsDictionaries = vi.fn();
const listFictionPatternDictionaries = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  listProperNounsDictionaries.mockResolvedValue({ success: true, dictionaries: [] });
  listFictionPatternDictionaries.mockResolvedValue({ success: true, dictionaries: [] });
  createProperNounsDictionary.mockResolvedValue({ success: true });
  createFictionDictionaryPair.mockResolvedValue({ success: true });
  createStructuralPatternsDictionary.mockResolvedValue({ success: true });

  (window as any).electronAPI = {
    listProperNounsDictionaries,
    listFictionPatternDictionaries,
    createProperNounsDictionary,
    createFictionDictionaryPair,
    createStructuralPatternsDictionary,
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
  });

  test('non-fiction ID still calls createProperNounsDictionary alone', async () => {
    render(<ConfigurationManager />);
    await openModalAndCreate('Test');

    await waitFor(() =>
      expect(createProperNounsDictionary).toHaveBeenCalledWith('properNouns-Test')
    );
    expect(createFictionDictionaryPair).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
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
  });
});

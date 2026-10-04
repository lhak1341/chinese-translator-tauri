/**
 * Tests for ConfigurationManager's create, rename and mount-time migration, over the real
 * Dictionary Store and binding provider (`realStores.tsx`).
 *
 * Fiction IDs are created as a pair (ADR-027), custom IDs as one file, and both go through the
 * binding context. A failed create surfaces as an error without adding a row. Every successful
 * create, rename and migration reaches the Dictionary Store, so what the tab lists never lags
 * behind what it just wrote to disk (the Cmd-6 staleness gap, architecture review 2026-07-17).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';
import { installRealStores, withPatterns, type StoresHarness } from './realStores';

// The engine module is 300+ KB and only its debug-level enum is needed here.
vi.mock('../../../utils/reader/BookRecordsBackend', () => ({
  setBookBinding: vi.fn().mockResolvedValue(undefined),
  renameBoundDictionary: vi.fn().mockResolvedValue(undefined),
  unbindDictionary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../EngineContext', () => ({
  useEngine: () => ({ reinitializeEngine: vi.fn().mockResolvedValue({ ok: true }) }),
}));

const holder = vi.hoisted(() => ({ useDictionary: (() => ({})) as () => unknown }));
vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => holder.useDictionary(),
}));

let h: StoresHarness;

/** No book is open: these tests are about creating and renaming dictionaries, not about the
 * Reader's authority over the fiction slice (see useDictionaryConfigManagement.binding.test). */
async function mount(ids: string[], config: Record<string, unknown> = { activeProperNouns: [] }) {
  vi.clearAllMocks();
  h = installRealStores({ ids, config });
  holder.useDictionary = h.useDictionary;
  await h.load();
  render(
    <h.Wrapper>
      <ConfigurationManager />
    </h.Wrapper>
  );
}

async function openModalAndCreate(name: string) {
  await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
  fireEvent.click(screen.getByText('New'));

  const input = screen.getByPlaceholderText('e.g., HarryPotter, JourneyToTheWest');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByText('Create'));
}

describe('ConfigurationManager handleCreateDictionary', () => {
  beforeEach(() => mount(['properNouns']));

  test('fiction ID is created as a pair, and both halves reach the Dictionary Store', async () => {
    await openModalAndCreate('f_Test');

    await waitFor(() => expect(screen.getByText('f_Test')).toBeInTheDocument());
    expect(h.api.createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_Test');
    expect(h.api.createProperNounsDictionary).not.toHaveBeenCalled();
    expect(Object.keys(h.store.getSnapshot().dictionaries)).toEqual(
      expect.arrayContaining(['properNouns-f_Test', 'patterns-f_Test'])
    );
  });

  test('non-fiction ID is one file, with no patterns half', async () => {
    await openModalAndCreate('Test');

    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
    expect(h.api.createProperNounsDictionary).toHaveBeenCalledWith('properNouns-Test');
    expect(h.api.createFictionDictionaryPair).not.toHaveBeenCalled();
    expect(h.api.createStructuralPatternsDictionary).not.toHaveBeenCalled();
    expect(h.store.getSnapshot().dictionaries['properNouns-Test']).toBeDefined();
    expect(Object.keys(h.store.getSnapshot().dictionaries)).not.toContain('patterns-Test');
  });

  test('create shows the new dictionary checked: Rust activated it, and the tab re-reads config', async () => {
    await openModalAndCreate('Test');

    // Regression: creation also activates on disk (Rust-side); the checkbox must reflect that
    // without a second click.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Test/ })).toBeChecked());
    expect(h.disk.disk.raw.activeProperNouns).toEqual(['properNouns-Test']);
  });

  test('fiction pair failure surfaces an error and does not add the dictionary', async () => {
    h.api.createFictionDictionaryPair.mockResolvedValueOnce({
      success: false,
      error: 'Failed to create paired patterns dictionary: disk full. Rolled back.',
    });

    await openModalAndCreate('f_Broken');

    await waitFor(() =>
      expect(
        screen.getByText(/Dictionary creation failed: Failed to create paired patterns dictionary/)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('f_Broken')).not.toBeInTheDocument();
    expect(h.store.getSnapshot().dictionaries['properNouns-f_Broken']).toBeUndefined();
  });
});

describe('ConfigurationManager — create-modal draft name (architecture review 2026-08-12, candidate #3)', () => {
  beforeEach(() => mount(['properNouns']));

  // Regression: closeCreateModal() now clears newDictionaryName on every close, not just on
  // a successful create — Cancel used to leave a stale draft behind for the next time the
  // modal opened (the two close paths had silently drifted from each other).
  test('Cancel clears the draft name — reopening shows an empty input, not the stale value', async () => {
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
    await mount(['properNouns', 'properNouns-f_Existing']);

    await waitFor(() =>
      expect(h.api.createStructuralPatternsDictionary).toHaveBeenCalledWith('patterns-f_Existing')
    );
    await waitFor(() =>
      expect(h.store.getSnapshot().dictionaries['patterns-f_Existing']).toBeDefined()
    );
  });

  test('does not re-create or reload a patterns dict that already exists', async () => {
    await mount(withPatterns(['properNouns', 'properNouns-f_Existing']));

    await waitFor(() => expect(screen.getByText('f_Existing')).toBeInTheDocument());
    expect(h.api.createStructuralPatternsDictionary).not.toHaveBeenCalled();
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
    await mount(['properNouns', 'properNouns-Old']);

    await openRenameAndConfirm('Old', 'New');

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    expect(h.api.renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-Old',
      'properNouns-New'
    );
    const inMemory = Object.keys(h.store.getSnapshot().dictionaries);
    expect(inMemory).toContain('properNouns-New');
    expect(inMemory).not.toContain('properNouns-Old');
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
  });

  test('fiction rename moves both halves, and the row follows', async () => {
    await mount(withPatterns(['properNouns', 'properNouns-f_Old']));

    await openRenameAndConfirm('f_Old', 'f_New');

    await waitFor(() => expect(screen.getByText('f_New')).toBeInTheDocument());
    expect(Object.keys(h.store.getSnapshot().dictionaries)).toEqual(
      expect.arrayContaining(['properNouns-f_New', 'patterns-f_New'])
    );
  });

  test('rename failure leaves the dictionaries in memory untouched', async () => {
    await mount(['properNouns', 'properNouns-Old']);
    h.api.renameProperNounsDictionary.mockResolvedValueOnce({
      success: false,
      error: 'Dictionary already exists',
    });

    await openRenameAndConfirm('Old', 'New');

    await waitFor(() =>
      expect(
        screen.getByText(/Dictionary rename failed: Dictionary already exists/)
      ).toBeInTheDocument()
    );
    expect(Object.keys(h.store.getSnapshot().dictionaries)).toContain('properNouns-Old');
    expect(Object.keys(h.store.getSnapshot().dictionaries)).not.toContain('properNouns-New');
    // A refused rename wrote nothing, so the cached config was never dropped.
    expect(h.disk.loadConfiguration).toHaveBeenCalledTimes(1);
  });
});

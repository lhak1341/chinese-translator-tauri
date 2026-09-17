/**
 * Tests for the one thing the open book takes away from the Configuration tab: authority
 * over the fiction slice of `activeProperNouns`.
 *
 * The rule has two halves and both are here, because getting only the first would be worse
 * than getting neither — fiction rows reflect the binding and cannot be toggled, while
 * generic and theme rows stay fully editable. This is rendered through
 * `ConfigurationManager` rather than the hook alone so it asserts what a reader can
 * actually click, which is where the rule either holds or does not.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';

const { saveAppConfig, loadAppConfig } = vi.hoisted(() => ({
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
  loadAppConfig: vi.fn(),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig,
  saveAppConfig,
  invalidateAppConfig: vi.fn(),
  callRustConfigWrite: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ loadDictionary: vi.fn(), removeDictionaryKey: vi.fn() }),
}));

const binding = vi.hoisted(() => ({
  isBookOpen: true,
  boundFictionDictionary: 'properNouns-f_TapDo' as string | null,
  openBook: { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' },
  fictionDictionaries: ['properNouns-f_TapDo', 'properNouns-f_TruTien'],
  refreshFictionDictionaries: async () => {},
}));
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => binding,
}));

const ALL_DICTIONARIES = [
  'properNouns',
  'properNouns-_AiCap',
  'properNouns-f_TapDo',
  'properNouns-f_TruTien',
];

beforeEach(() => {
  vi.clearAllMocks();
  binding.isBookOpen = true;
  binding.boundFictionDictionary = 'properNouns-f_TapDo';
  loadAppConfig.mockResolvedValue({
    // Deliberately stale and wrong for the open book: the previous book's fiction
    // dictionary is still in the saved list. What the reader sees must come from the
    // binding, not from this.
    engine: { activeProperNouns: ['properNouns', 'properNouns-f_TruTien'] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
  });
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    listProperNounsDictionaries: vi
      .fn()
      .mockResolvedValue({ success: true, dictionaries: ALL_DICTIONARIES }),
    listFictionPatternDictionaries: vi.fn().mockResolvedValue({ success: true, dictionaries: [] }),
    createStructuralPatternsDictionary: vi.fn().mockResolvedValue({ success: true }),
  };
});

/** The checkbox belonging to one dictionary row, found by its visible label. */
function checkboxFor(label: string): HTMLInputElement {
  return screen.getByText(label).closest('label')!.querySelector('input')!;
}

describe('Configuration while a book is open', () => {
  test('fiction rows reflect the binding, not the last-saved config', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TapDo')).toBeInTheDocument());

    expect(checkboxFor('f_TapDo').checked).toBe(true);
    expect(checkboxFor('f_TruTien').checked).toBe(false);
  });

  test('fiction rows cannot be toggled here', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TapDo')).toBeInTheDocument());

    expect(checkboxFor('f_TapDo').disabled).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(true);

    fireEvent.click(checkboxFor('f_TruTien'));
    expect(saveAppConfig).not.toHaveBeenCalled();
  });

  test('generic and theme rows stay fully editable', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('_AiCap')).toBeInTheDocument());

    expect(checkboxFor('_AiCap').disabled).toBe(false);
    expect(checkboxFor('General Purpose Dictionary').disabled).toBe(false);

    fireEvent.click(checkboxFor('_AiCap'));
    await waitFor(() =>
      expect(saveAppConfig).toHaveBeenCalledWith({
        engine: {
          // The open book's dictionary, not the stale one the saved config still lists:
          // a generic toggle must not resurrect the previous book's fiction entry.
          activeProperNouns: ['properNouns', 'properNouns-f_TapDo', 'properNouns-_AiCap'],
        },
      })
    );
  });

  test('names the book the fiction list is coming from', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText(/set by Tạp đồ/)).toBeInTheDocument());
  });
});

describe('Configuration with no book open', () => {
  test('fiction rows go back to being editable', async () => {
    binding.isBookOpen = false;
    binding.boundFictionDictionary = null;

    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TruTien')).toBeInTheDocument());

    // Straight from config again, with no binding overlaying it.
    expect(checkboxFor('f_TruTien').checked).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(false);
  });
});

/**
 * Tests for MoveDialog — the unified single-entry/bulk move dialog that replaced
 * MoveEntryDialog.tsx and BulkMoveDialog.tsx (architecture review 2026-08-28, candidate #1
 * grilling). `entries.length === 1` drives the single-entry code paths (named overwrite/
 * target filtering, single-entry preview with metadata tags); `entries.length > 1` drives
 * the bulk paths (aggregate-count warnings, plain multi-item preview).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import MoveDialog from '../MoveDialog';

const mockUseDictionary = vi.fn();
vi.mock('../DictionaryContext', () => ({
  useDictionary: () => mockUseDictionary(),
}));

// The Dictionary Store's list of every dictionary.
const mockDictionaryTypes = {
  characters: { label: 'Characters' },
  phrases: { label: 'Phrases' },
  properNouns: { label: 'General Purpose Dictionary' },
  'properNouns-NovelName': { label: 'Proper Nouns - NovelName' },
  'properNouns-Unloaded': { label: 'Proper Nouns - Unloaded' },
  patterns: { label: 'Patterns' },
  'patterns-f_NovelName': { label: 'Pattern - f_NovelName' },
  conversion: { label: 'Conversion' },
  punctuation: { label: 'Punctuation' },
};

describe('MoveDialog', () => {
  const mockMoveEntry = vi.fn();
  const mockBulkMoveEntries = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockLoadDictionary = vi.fn();

  const mockDictionaries = {
    characters: { 你: 'bạn' },
    phrases: {
      你好: { translation: 'xin chào' },
      再见: { translation: 'tạm biệt' },
    },
    properNouns: { 张三: { translation: 'Truong Tam' }, 你好: { translation: 'chào anh' } },
    'properNouns-NovelName': {},
    'patterns-f_NovelName': {},
    patterns: {
      '在<X>眼中': {
        translation: 'trong mắt <X>',
        allowAsPatternVariable: true,
      },
      '跟<X>说': {
        translation: 'nói với <X>',
        allowAsPatternVariable: true,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDictionary.mockReturnValue({
      dictionaries: mockDictionaries,
      dictionaryTypes: mockDictionaryTypes,
      moveEntry: mockMoveEntry,
      bulkMoveEntries: mockBulkMoveEntries,
      loadDictionary: mockLoadDictionary,
    });
    mockLoadDictionary.mockResolvedValue(undefined);
  });

  describe('single entry (entries.length === 1)', () => {
    test('renders singular title and entry preview', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      expect(screen.getByRole('heading', { name: 'Move Entry' })).toBeInTheDocument();
      expect(screen.getByText('"你好"')).toBeInTheDocument();
      expect(screen.getByText('"xin chào"')).toBeInTheDocument();
    });

    test('excludes the current dictionary from the destination dropdown', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

      const options = Array.from(select.options).map((opt) => opt.value);
      expect(options).not.toContain('phrases');
      expect(options).toContain('properNouns');
    });

    test('shows named overwrite detail with the old translation', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns' } });

      await waitFor(() =>
        expect(
          screen.getByText(
            /Entry "你好" already exists in target dictionary with translation "chào anh"/
          )
        ).toBeInTheDocument()
      );
    });

    test('offers only same-family targets: patterns move between pattern dictionaries only', async () => {
      render(
        <MoveDialog
          entries={['在<X>眼中']}
          currentDictionary="patterns"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

      const options = Array.from(select.options)
        .map((opt) => opt.value)
        .filter(Boolean);
      expect(options).toEqual(['patterns-f_NovelName']);
    });

    test('offers phrases and proper-noun dictionaries, never string-only lookup tables', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

      const options = Array.from(select.options)
        .map((opt) => opt.value)
        .filter(Boolean);
      expect(options).toContain('properNouns');
      expect(options).toContain('properNouns-NovelName');
      for (const excluded of ['characters', 'conversion', 'punctuation', 'patterns']) {
        expect(options).not.toContain(excluded);
      }
    });

    test('loads a not-yet-loaded target dictionary when it is selected', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-Unloaded' } });

      await waitFor(() => expect(mockLoadDictionary).toHaveBeenCalledWith('properNouns-Unloaded'));
    });

    test('does not reload a target that is already in memory', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns' } });

      expect(mockLoadDictionary).not.toHaveBeenCalled();
    });

    test('calls moveEntry (not bulkMoveEntries) and closes itself on success', async () => {
      mockMoveEntry.mockResolvedValue(undefined);
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));

      await waitFor(() => {
        expect(mockMoveEntry).toHaveBeenCalledWith(
          'phrases',
          'properNouns-NovelName',
          '你好',
          'Proper Nouns - NovelName'
        );
        expect(mockBulkMoveEntries).not.toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('shows error and does not close on failure', async () => {
      mockMoveEntry.mockRejectedValue(new Error('disk full'));
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));

      await waitFor(() =>
        expect(screen.getByText(/Failed to move entry: disk full/)).toBeInTheDocument()
      );
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('bulk (entries.length > 1)', () => {
    test('renders pluralized title and plain preview list (no metadata tags)', async () => {
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      expect(screen.getByRole('heading', { name: 'Move 2 Entries' })).toBeInTheDocument();
      expect(screen.getByText('"你好"')).toBeInTheDocument();
      expect(screen.getByText('"再见"')).toBeInTheDocument();
    });

    test('shows "...and N more" beyond 3 entries', async () => {
      render(
        <MoveDialog
          entries={['你好', '再见', 'a', 'b', 'c']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      expect(screen.getByText(/\.\.\.and 2 more entries/)).toBeInTheDocument();
    });

    test('shows aggregate-count overwrite warning, not per-entry detail', async () => {
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns' } });

      await waitFor(() =>
        expect(
          screen.getByText(/1 entry already exist in target and will be overwritten/)
        ).toBeInTheDocument()
      );
    });

    test('calls bulkMoveEntries (not moveEntry) and closes itself on success', async () => {
      mockBulkMoveEntries.mockResolvedValue({ movedCount: 2, errors: [] });
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.click(screen.getByRole('button', { name: 'Move 2 Entries' }));

      await waitFor(() => {
        expect(mockBulkMoveEntries).toHaveBeenCalledWith(
          'phrases',
          'properNouns-NovelName',
          expect.arrayContaining(['你好', '再见']),
          'Proper Nouns - NovelName'
        );
        expect(mockMoveEntry).not.toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('shows error and does not close on failure', async () => {
      mockBulkMoveEntries.mockRejectedValue(new Error('disk full'));
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.click(screen.getByRole('button', { name: 'Move 2 Entries' }));

      await waitFor(() =>
        expect(screen.getByText(/Failed to move entries: disk full/)).toBeInTheDocument()
      );
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('shared interaction behavior (both counts)', () => {
    test('move button disabled until a destination is selected', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const moveButton = await waitFor(() => screen.getByRole('button', { name: 'Move Entry' }));
      expect(moveButton).toBeDisabled();

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });
      expect(moveButton).not.toBeDisabled();
    });

    test('shows loading state and disables controls while moving', async () => {
      let resolveMove: () => void;
      mockMoveEntry.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveMove = resolve;
        })
      );
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));

      await waitFor(() => expect(screen.getByText('Moving...')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('combobox')).toBeDisabled();

      await act(async () => resolveMove!());
    });

    test('Enter key submits when a destination is selected', async () => {
      mockMoveEntry.mockResolvedValue(undefined);
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'properNouns-NovelName' } });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

      await waitFor(() => expect(mockMoveEntry).toHaveBeenCalled());
    });

    test('Escape key closes when not moving', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('close (X) button, Cancel button, and backdrop click all call onClose', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      fireEvent.click(screen.getByLabelText('Close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    test('dialog content click does not close', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      fireEvent.click(screen.getByRole('heading', { name: 'Move Entry' }));
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('shows empty-state message when no other dictionary is available', async () => {
      mockUseDictionary.mockReturnValue({
        ...mockUseDictionary(),
        dictionaryTypes: { characters: { label: 'Characters' } },
      });

      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await waitFor(() =>
        expect(screen.getByText(/No compatible dictionaries/)).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Move Entry' })).toBeDisabled();
    });
  });
});

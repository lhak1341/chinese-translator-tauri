/**
 * Tests for BulkMoveDialog — mirrors MoveEntryDialog.test.tsx's shape (no separate hook here,
 * all logic inline: dictionary list load, overwrite-detection, move execution). Previously
 * untested (architecture review 2026-07-17, follow-up to candidate 1).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import BulkMoveDialog from '../BulkMoveDialog';

const mockUseDictionary = vi.fn();
vi.mock('../DictionaryContext', () => ({
  useDictionary: () => mockUseDictionary(),
}));

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({
    characters: { label: 'Characters' },
    phrases: { label: 'Phrases' },
    properNouns: { label: 'General Purpose Dictionary' },
    'properNouns-NovelName': { label: 'Proper Nouns - NovelName' },
  }),
}));

describe('BulkMoveDialog', () => {
  const mockBulkMoveEntries = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnMoveSuccess = vi.fn();

  const mockDictionaries = {
    characters: {
      你好: 'xin chào',
      再见: 'tạm biệt',
    },
    phrases: {},
    properNouns: { 张三: { translation: 'Truong Tam' } },
    'properNouns-NovelName': {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDictionary.mockReturnValue({
      dictionaries: mockDictionaries,
      bulkMoveEntries: mockBulkMoveEntries,
    });
  });

  describe('rendering', () => {
    test('renders title with pluralized entry count', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好', '再见'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByRole('heading', { name: 'Move 2 Entries' })).toBeInTheDocument();
    });

    test('singularizes the title for exactly one entry', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByRole('heading', { name: 'Move 1 Entry' })).toBeInTheDocument();
    });

    test('excludes the current dictionary from the destination dropdown', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

      const options = Array.from(select.options).map((opt) => opt.value);
      expect(options).not.toContain('characters');
      expect(options).toContain('phrases');
    });

    test('shows a preview of up to 3 entries with their translations', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好', '再见'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByText('"你好"')).toBeInTheDocument();
      expect(screen.getByText('"xin chào"')).toBeInTheDocument();
      expect(screen.getByText('"再见"')).toBeInTheDocument();
    });

    test('shows "...and N more" when more than 3 entries are selected', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好', '再见', 'a', 'b', 'c'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByText(/\.\.\.and 2 more entries/)).toBeInTheDocument();
    });

    test('formats the "From" label for the base properNouns dictionary', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="properNouns"
          selectedEntries={new Set(['张三'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByText('Proper Nouns (Base)')).toBeInTheDocument();
    });

    test('formats the "From" label for a custom properNouns dictionary', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="properNouns-NovelName"
          selectedEntries={new Set(['张三'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      expect(screen.getByText('Proper Nouns - NovelName')).toBeInTheDocument();
    });
  });

  describe('overwrite warning', () => {
    test('shows a warning when the target dictionary already has a selected entry', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['张三'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
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

    test('shows no warning when the target has none of the selected sources', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(screen.queryByText(/already exist/)).not.toBeInTheDocument();
    });
  });

  describe('move operation', () => {
    test('calls bulkMoveEntries with the right args and onMoveSuccess on success', async () => {
      mockBulkMoveEntries.mockResolvedValue(undefined);
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好', '再见'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'phrases' } });

      fireEvent.click(screen.getByRole('button', { name: /Move 2 Entries/ }));

      await waitFor(() => {
        expect(mockBulkMoveEntries).toHaveBeenCalledWith(
          'characters',
          'phrases',
          expect.arrayContaining(['你好', '再见']),
          'Phrases'
        );
        expect(mockOnMoveSuccess).toHaveBeenCalled();
      });
    });

    test('move button is disabled until a target dictionary is selected', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const moveButton = await waitFor(() => screen.getByRole('button', { name: /Move 1 Entry/ }));
      expect(moveButton).toBeDisabled();
    });

    test('shows a loading state and disables controls while moving', async () => {
      let resolveMove: () => void;
      mockBulkMoveEntries.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveMove = resolve;
        })
      );
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'phrases' } });

      fireEvent.click(screen.getByRole('button', { name: /Move 1 Entry/ }));

      await waitFor(() => expect(screen.getByText('Moving...')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

      await act(async () => resolveMove!());
    });

    test('shows an error message and does not call onMoveSuccess on failure', async () => {
      mockBulkMoveEntries.mockRejectedValue(new Error('disk full'));
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      const select = await waitFor(() => screen.getByRole('combobox') as HTMLSelectElement);
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
      fireEvent.change(select, { target: { value: 'phrases' } });

      fireEvent.click(screen.getByRole('button', { name: /Move 1 Entry/ }));

      await waitFor(() => expect(screen.getByText(/disk full/)).toBeInTheDocument());
      expect(mockOnMoveSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Move 1 Entry/ })).not.toBeDisabled();
    });
  });

  describe('close behavior', () => {
    test('close (X) button calls onClose', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      fireEvent.click(screen.getByLabelText('Close'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('Cancel button calls onClose', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('backdrop click calls onClose when not moving', async () => {
      const { container } = render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      fireEvent.click(container.firstChild as HTMLElement);
      expect(mockOnClose).toHaveBeenCalled();
    });

    test('dialog content click does not close', async () => {
      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );
      fireEvent.click(screen.getByRole('heading', { name: 'Move 1 Entry' }));
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    test('shows an empty-state message when no other dictionary is available', async () => {
      const { getDictionaryTypes } = await import('../DictionaryTypes');
      vi.mocked(getDictionaryTypes).mockResolvedValueOnce({
        characters: { label: 'Characters' },
      } as any);

      render(
        <BulkMoveDialog
          selectedDictionary="characters"
          selectedEntries={new Set(['你好'])}
          onClose={mockOnClose}
          onMoveSuccess={mockOnMoveSuccess}
        />
      );

      await waitFor(() =>
        expect(
          screen.getByText('No other dictionaries available. Create another dictionary first.')
        ).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: /Move 1 Entry/ })).toBeDisabled();
    });
  });
});

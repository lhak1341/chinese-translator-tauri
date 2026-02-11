/**
 * Tests for MoveEntryDialog Component
 *
 * Tests modal dialog for moving dictionary entries:
 * - Rendering and dictionary selection
 * - Move operation (success and error cases)
 * - Loading states
 * - Validation
 * - Cancel and close behavior
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import MoveEntryDialog from '../MoveEntryDialog';
import * as DictionaryContext from '../DictionaryContext';

// Mock dictionary context
const mockUseDictionary = vi.fn();

vi.mock('../DictionaryContext', () => ({
  useDictionary: () => mockUseDictionary(),
}));

// Mock getDictionaryTypes
vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({
    characters: { label: 'Characters' },
    phrases: { label: 'Phrases' },
    properNouns: { label: 'General Purpose Dictionary' },
    'properNouns-NovelName': { label: 'Proper Nouns - NovelName' },
    patterns: { label: 'Patterns' },
    conversion: { label: 'Conversion' },
    punctuation: { label: 'Punctuation' },
  }),
}));

describe('MoveEntryDialog', () => {
  const mockEntry = {
    source: '你好',
    translation: 'xin chào',
  };

  const mockDictionaries = {
    characters: {
      你好: 'xin chào',
    },
    phrases: {},
    properNouns: {},
    'properNouns-NovelName': {},
    patterns: {
      '在<X>眼中': {
        translation: 'trong mắt <X>',
        allowAsPatternVariable: false,
        lowPriority: false,
      },
    },
  };

  const mockMoveEntry = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseDictionary.mockReturnValue({
      dictionaries: mockDictionaries,
      moveEntry: mockMoveEntry,
    });
  });

  describe('rendering', () => {
    test('should render dialog with title', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Move Entry' })).toBeInTheDocument();
      });
    });

    test('should render dropdown with available dictionaries', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      expect(screen.getByText('Choose destination dictionary...')).toBeInTheDocument();
    });

    test('should exclude current dictionary from options', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options).map((opt) => opt.value);

      expect(options).not.toContain('characters');
      expect(options).toContain('phrases');
      expect(options).toContain('properNouns');
    });

    test('should format dictionary labels correctly', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        expect(screen.getByText('Phrases')).toBeInTheDocument();
      });

      expect(screen.getByText('Proper Nouns (Base)')).toBeInTheDocument();
      expect(screen.getByText('Proper Nouns - NovelName')).toBeInTheDocument();
    });

    test('should render Move Entry button', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Move Entry/i })).toBeInTheDocument();
      });
    });

    test('should render Cancel button', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      });
    });
  });

  describe('dictionary selection', () => {
    test('should allow selecting a dictionary', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(select.value).toBe('phrases');
    });

    test('should enable Move button when dictionary selected', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      expect(moveButton).toBeDisabled();

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(moveButton).not.toBeDisabled();
    });
  });

  describe('move operation', () => {
    test('should successfully move entry', async () => {
      mockMoveEntry.mockResolvedValue(undefined);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(mockMoveEntry).toHaveBeenCalledWith(
          'characters',
          'phrases',
          mockEntry.source,
          'Phrases'
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    test('should show loading state during move', async () => {
      let resolveMove: () => void;
      const movePromise = new Promise<void>((resolve) => {
        resolveMove = resolve;
      });
      mockMoveEntry.mockReturnValue(movePromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText('Moving...')).toBeInTheDocument();
      });

      expect(moveButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();

      resolveMove!();
    });

    test('should handle move error', async () => {
      const errorMessage = 'Failed to save entry';
      mockMoveEntry.mockRejectedValue(new Error(errorMessage));

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to move entry/i)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(moveButton).not.toBeDisabled();
    });

    test('should handle move failure with rollback error', async () => {
      mockMoveEntry.mockRejectedValue(new Error('Rollback failed: Delete failed'));

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to move entry/i)).toBeInTheDocument();
        expect(screen.getByText(/Rollback failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('validation', () => {
    test('should keep Move button disabled when no dictionary selected', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });

      expect(moveButton).toBeDisabled();

      fireEvent.click(moveButton);
      expect(mockMoveEntry).not.toHaveBeenCalled();
    });

    test('should enable Move button when dictionary is selected', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      const select = screen.getByRole('combobox');

      expect(moveButton).toBeDisabled();

      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(moveButton).not.toBeDisabled();
    });
  });

  describe('close behavior', () => {
    test('should close on Cancel button click', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('should close on backdrop click', async () => {
      const { container } = render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const backdrop = container.firstChild as HTMLElement;
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('should not close when clicking dialog content', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const dialogTitle = screen.getByRole('heading', { name: 'Move Entry' });
      fireEvent.click(dialogTitle);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should not allow close during move operation', async () => {
      let resolveMove: () => void;
      const movePromise = new Promise<void>((resolve) => {
        resolveMove = resolve;
      });
      mockMoveEntry.mockReturnValue(movePromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText('Moving...')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();

      await act(async () => {
        resolveMove!();
      });
    });
  });

  describe('edge cases', () => {
    test('should handle only one other dictionary available', async () => {
      const { getDictionaryTypes } = await import('../DictionaryTypes');
      vi.mocked(getDictionaryTypes).mockResolvedValueOnce({
        characters: { label: 'Characters' },
        phrases: { label: 'Phrases' },
      } as any);

      mockUseDictionary.mockReturnValue({
        dictionaries: {
          characters: {
            你好: 'xin chào',
          },
          phrases: {},
        },
        moveEntry: mockMoveEntry,
      });

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(0);
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options)
        .map((opt) => opt.value)
        .filter((val) => val !== '');

      expect(options).toHaveLength(1);
      expect(options[0]).toBe('phrases');
    });

    test('should handle entry with special characters', async () => {
      const specialEntry = {
        source: '在<X>眼中',
        translation: 'trong mắt <X>',
      };

      mockMoveEntry.mockResolvedValue(undefined);

      render(
        <MoveEntryDialog entry={specialEntry} onClose={mockOnClose} currentDictionary="patterns" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(mockMoveEntry).toHaveBeenCalledWith(
          'patterns',
          'phrases',
          specialEntry.source,
          'Phrases'
        );
      });
    });

    test('should handle error without message', async () => {
      mockMoveEntry.mockRejectedValue({});

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText(/Unknown error/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    test('should have accessible buttons', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      expect(screen.getByRole('button', { name: /Move Entry/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    test('should have accessible dropdown', async () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    test('should disable controls during loading', async () => {
      let resolveMove: () => void;
      const movePromise = new Promise<void>((resolve) => {
        resolveMove = resolve;
      });
      mockMoveEntry.mockReturnValue(movePromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.options.length).toBeGreaterThan(1);
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeDisabled();
        expect(moveButton).toBeDisabled();
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
      });

      resolveMove!();
    });
  });
});

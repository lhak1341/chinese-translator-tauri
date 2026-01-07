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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import MoveEntryDialog from '../MoveEntryDialog';
import * as DictionaryContext from '../DictionaryContext';

// Mock dictionary context
const mockUseDictionary = vi.fn();

vi.mock('../DictionaryContext', () => ({
  useDictionary: () => mockUseDictionary(),
}));

describe('MoveEntryDialog', () => {
  const mockEntry = {
    source: '你好',
    translation: 'xin chào',
  };

  const mockDictionaries = {
    characters: { entries: [] },
    phrases: { entries: [] },
    properNouns: { entries: [] },
    'properNouns-NovelName': { entries: [] },
  };

  const mockAddEntry = vi.fn();
  const mockDeleteEntry = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseDictionary.mockReturnValue({
      dictionaries: mockDictionaries,
      addEntry: mockAddEntry,
      deleteEntry: mockDeleteEntry,
    });
  });

  describe('rendering', () => {
    test('should render dialog with title', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      expect(screen.getByRole('heading', { name: 'Move Entry' })).toBeInTheDocument();
    });

    test('should render dropdown with available dictionaries', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Should have placeholder
      expect(screen.getByText('Select a dictionary...')).toBeInTheDocument();
    });

    test('should exclude current dictionary from options', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options).map((opt) => opt.value);

      // Should not include current dictionary
      expect(options).not.toContain('characters');

      // Should include other dictionaries
      expect(options).toContain('phrases');
      expect(options).toContain('properNouns');
    });

    test('should format dictionary labels correctly', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Check label formatting
      expect(screen.getByText('Phrases')).toBeInTheDocument();
      expect(screen.getByText('General Purpose Dictionary')).toBeInTheDocument();
      expect(screen.getByText('Proper Nouns - NovelName')).toBeInTheDocument();
    });

    test('should render Move Entry button', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      expect(screen.getByRole('button', { name: /Move Entry/i })).toBeInTheDocument();
    });

    test('should render Cancel button', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });
  });

  describe('dictionary selection', () => {
    test('should allow selecting a dictionary', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(select.value).toBe('phrases');
    });

    test('should enable Move button when dictionary selected', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      expect(moveButton).toBeDisabled();

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      expect(moveButton).not.toBeDisabled();
    });
  });

  describe('move operation', () => {
    test('should successfully move entry', async () => {
      mockAddEntry.mockResolvedValue(undefined);
      mockDeleteEntry.mockResolvedValue(undefined);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Select target dictionary
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      // Click Move Entry
      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(mockAddEntry).toHaveBeenCalledWith(
          'phrases',
          mockEntry.source,
          mockEntry.translation
        );
        expect(mockDeleteEntry).toHaveBeenCalledWith('characters', mockEntry.source);
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    test('should show loading state during move', async () => {
      // Create a promise we can control
      let resolveAdd: () => void;
      const addPromise = new Promise<void>((resolve) => {
        resolveAdd = resolve;
      });
      mockAddEntry.mockReturnValue(addPromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Select and click Move
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Moving...')).toBeInTheDocument();
      });

      // Buttons should be disabled
      expect(moveButton).toBeDisabled();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();

      // Resolve the promise
      resolveAdd!();
    });

    test('should handle move error', async () => {
      const errorMessage = 'Failed to save entry';
      mockAddEntry.mockRejectedValue(new Error(errorMessage));

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Select and click Move
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Failed to move entry/i)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
      });

      // Should not close dialog
      expect(mockOnClose).not.toHaveBeenCalled();

      // Should re-enable buttons
      expect(moveButton).not.toBeDisabled();
    });

    test('should handle delete error after successful add', async () => {
      mockAddEntry.mockResolvedValue(undefined);
      mockDeleteEntry.mockRejectedValue(new Error('Delete failed'));

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to move entry/i)).toBeInTheDocument();
        expect(screen.getByText(/Delete failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('validation', () => {
    test('should keep Move button disabled when no dictionary selected', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });

      // Move button should be disabled without selection
      expect(moveButton).toBeDisabled();

      // Should not allow clicking
      fireEvent.click(moveButton);
      expect(mockAddEntry).not.toHaveBeenCalled();
      expect(mockDeleteEntry).not.toHaveBeenCalled();
    });

    test('should enable Move button when dictionary is selected', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      const select = screen.getByRole('combobox');

      // Initially disabled
      expect(moveButton).toBeDisabled();

      // Select dictionary
      fireEvent.change(select, { target: { value: 'phrases' } });

      // Should be enabled now
      expect(moveButton).not.toBeDisabled();
    });
  });

  describe('close behavior', () => {
    test('should close on Cancel button click', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('should close on backdrop click', () => {
      const { container } = render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Click backdrop (outermost div)
      const backdrop = container.firstChild as HTMLElement;
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });

    test('should not close when clicking dialog content', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Click on dialog heading
      const dialogTitle = screen.getByRole('heading', { name: 'Move Entry' });
      fireEvent.click(dialogTitle);

      // Should not close
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('should not allow close during move operation', async () => {
      let resolveAdd: () => void;
      const addPromise = new Promise<void>((resolve) => {
        resolveAdd = resolve;
      });
      mockAddEntry.mockReturnValue(addPromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      // Start move operation
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      // Wait for loading state
      await waitFor(() => {
        expect(screen.getByText('Moving...')).toBeInTheDocument();
      });

      // Cancel should be disabled
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();

      // Resolve
      resolveAdd!();
    });
  });

  describe('edge cases', () => {
    test('should handle only one other dictionary available', () => {
      mockUseDictionary.mockReturnValue({
        dictionaries: {
          characters: { entries: [] },
          phrases: { entries: [] },
        },
        addEntry: mockAddEntry,
        deleteEntry: mockDeleteEntry,
      });

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

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

      mockAddEntry.mockResolvedValue(undefined);
      mockDeleteEntry.mockResolvedValue(undefined);

      render(
        <MoveEntryDialog entry={specialEntry} onClose={mockOnClose} currentDictionary="patterns" />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(mockAddEntry).toHaveBeenCalledWith(
          'phrases',
          specialEntry.source,
          specialEntry.translation
        );
      });
    });

    test('should handle error without message', async () => {
      mockAddEntry.mockRejectedValue({});

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

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
    test('should have accessible buttons', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      expect(screen.getByRole('button', { name: /Move Entry/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    test('should have accessible dropdown', () => {
      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    test('should disable controls during loading', async () => {
      let resolveAdd: () => void;
      const addPromise = new Promise<void>((resolve) => {
        resolveAdd = resolve;
      });
      mockAddEntry.mockReturnValue(addPromise);

      render(
        <MoveEntryDialog entry={mockEntry} onClose={mockOnClose} currentDictionary="characters" />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'phrases' } });

      const moveButton = screen.getByRole('button', { name: /Move Entry/i });
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeDisabled();
        expect(moveButton).toBeDisabled();
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
      });

      resolveAdd!();
    });
  });
});

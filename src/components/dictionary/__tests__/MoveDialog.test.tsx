/**
 * Tests for MoveDialog — the unified single-entry/bulk move dialog that replaced
 * MoveEntryDialog.tsx and BulkMoveDialog.tsx (architecture review 2026-08-28, candidate #1
 * grilling). `entries.length === 1` drives the single-entry code paths (named overwrite/
 * target filtering, single-entry preview with metadata tags); `entries.length > 1` drives
 * the bulk paths (aggregate-count warnings, plain multi-item preview).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import MoveDialog from '../MoveDialog';
import { getDictionaryDropdownLabel } from '../../../utils/dictionary/DictionaryLabels';

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
  'patterns-f_NovelName': { label: 'Patterns - f_NovelName' },
  conversion: { label: 'Conversion' },
  punctuation: { label: 'Punctuation' },
};

// The destination is a kit Select (style-kit issue 15): its options exist only while it is
// open, and show each dictionary's dropdown label, not its id.
const targetTrigger = () => screen.getByRole('combobox', { name: 'To:' });

async function openTargets(): Promise<void> {
  const trigger = await waitFor(targetTrigger);
  if (trigger.getAttribute('aria-expanded') === 'true') return;
  const user = userEvent.setup();
  act(() => trigger.focus());
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('listbox');
}

/** The ids of the offered destinations, read back from their labels. */
function targetIds(): string[] {
  const labels = screen.getAllByRole('option').map((o) => o.textContent);
  return Object.keys(mockDictionaryTypes).filter((id) =>
    labels.includes(getDictionaryDropdownLabel(id))
  );
}

async function chooseTarget(id: string): Promise<void> {
  await openTargets();
  await userEvent
    .setup()
    .click(screen.getByRole('option', { name: getDictionaryDropdownLabel(id) }));
  await waitFor(() => expect(targetTrigger()).toHaveTextContent(getDictionaryDropdownLabel(id)));
}

describe('MoveDialog', () => {
  const mockMoveEntries = vi.fn();
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
      moveEntries: mockMoveEntries,
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
      await openTargets();

      const options = targetIds();
      expect(options).not.toContain('phrases');
      expect(options).toContain('properNouns');
    });

    test('does not warn about an entry the source no longer holds, even if the target has the key', async () => {
      // 张三 is only in properNouns, so moving it out of phrases moves nothing and overwrites
      // nothing — the plan skips it, and the warning is read from the plan.
      mockUseDictionary.mockReturnValue({
        dictionaries: {
          ...mockDictionaries,
          phrases: { 再见: { translation: 'tạm biệt' } },
        },
        dictionaryTypes: mockDictionaryTypes,
        moveEntries: mockMoveEntries,
        loadDictionary: mockLoadDictionary,
      });
      render(
        <MoveDialog
          entries={['张三']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns');

      await waitFor(() =>
        expect(targetTrigger()).toHaveTextContent(getDictionaryDropdownLabel('properNouns'))
      );
      expect(screen.queryByText(/already exists in target dictionary/)).not.toBeInTheDocument();
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
      await openTargets();
      await chooseTarget('properNouns');

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
      await openTargets();

      const options = targetIds();
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
      await openTargets();

      const options = targetIds();
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
      await openTargets();
      await chooseTarget('properNouns-Unloaded');

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
      await openTargets();
      await chooseTarget('properNouns');

      expect(mockLoadDictionary).not.toHaveBeenCalled();
    });

    test('calls moveEntries with the one entry and closes itself on success', async () => {
      mockMoveEntries.mockResolvedValue(undefined);
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns-NovelName');

      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));

      await waitFor(() => {
        expect(mockMoveEntries).toHaveBeenCalledWith(
          'phrases',
          'properNouns-NovelName',
          ['你好'],
          'Proper Nouns - NovelName'
        );
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('shows error and does not close on failure', async () => {
      mockMoveEntries.mockRejectedValue(new Error('disk full'));
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns-NovelName');

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
      await openTargets();
      await chooseTarget('properNouns');

      await waitFor(() =>
        expect(
          screen.getByText(/1 entry already exist in target and will be overwritten/)
        ).toBeInTheDocument()
      );
    });

    test('calls moveEntries with every entry and closes itself on success', async () => {
      mockMoveEntries.mockResolvedValue(undefined);
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns-NovelName');

      fireEvent.click(screen.getByRole('button', { name: 'Move 2 Entries' }));

      await waitFor(() => {
        expect(mockMoveEntries).toHaveBeenCalledWith(
          'phrases',
          'properNouns-NovelName',
          expect.arrayContaining(['你好', '再见']),
          'Proper Nouns - NovelName'
        );
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    test('shows error and does not close on failure', async () => {
      mockMoveEntries.mockRejectedValue(new Error('disk full'));
      render(
        <MoveDialog
          entries={['你好', '再见']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns-NovelName');

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

      await chooseTarget('properNouns-NovelName');
      expect(moveButton).not.toBeDisabled();
    });

    test('shows loading state and disables controls while moving', async () => {
      let resolveMove: () => void;
      mockMoveEntries.mockReturnValue(
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
      await openTargets();
      await chooseTarget('properNouns-NovelName');

      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));

      await waitFor(() => expect(screen.getByText('Moving...')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('combobox')).toBeDisabled();

      await act(async () => resolveMove!());
    });

    test('Enter key submits when a destination is selected', async () => {
      mockMoveEntries.mockResolvedValue(undefined);
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await openTargets();
      await chooseTarget('properNouns-NovelName');

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

      await waitFor(() => expect(mockMoveEntries).toHaveBeenCalled());
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

    test.each(['Close', 'Cancel'])('the %s button calls onClose', async (name) => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      fireEvent.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1));
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    test('opens with focus on the destination select', async () => {
      render(
        <MoveDialog
          entries={['你好']}
          currentDictionary="phrases"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      await waitFor(() => expect(document.activeElement).toBe(targetTrigger()));
    });

    test('Escape does not close while a move runs', async () => {
      let resolveMove: () => void;
      mockMoveEntries.mockReturnValue(
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
      await openTargets();
      await chooseTarget('properNouns-NovelName');
      fireEvent.click(screen.getByRole('button', { name: 'Move Entry' }));
      await waitFor(() => expect(screen.getByText('Moving...')).toBeInTheDocument());

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();

      await act(async () => resolveMove!());
      await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1));
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

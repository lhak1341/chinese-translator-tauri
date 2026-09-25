import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import RuleMatchesModal from '../RuleMatchesModal';
import type { TransformRule } from '../../../types/TransformRuleTypes';
import type { DictionaryData } from '../../../types/DictionaryTypes';

vi.mock('../../dictionary/MoveDialog', () => ({
  default: ({ entries, currentDictionary }: { entries: string[]; currentDictionary: string }) => (
    <div data-testid="move-dialog">
      {entries.join(',')}|{currentDictionary}
    </div>
  ),
}));

// Covers exactly what RulesManager.test.tsx's "clicking the magnifier opens a modal"
// integration test and TransformRuleEngine.test.ts's findRuleMatchingEntries suite do
// NOT: commitTranslation's metadata-merge variants, the VAR-badge properNoun-vs-phrases
// branches, the showSemantic conditional, Semantic-toggle wiring, and the empty state.
// See CONTEXT.md's "Transform Rule" entry and ADR-038 for what the modal is and why.

const RULE: TransformRule = {
  id: 'rule-1',
  matchKind: 'suffix',
  key: '城',
  relocate: true,
  capitalizeExceptN: 1,
  semanticType: 'location',
  enabled: true,
};

// 4 entries, all matching RULE's suffix "城", each isolating one uncovered branch:
//   - 南京城 (properNouns-f_test): no metadata at all — commitTranslation base variant;
//     VAR badge non-clickable "✓ VAR" (isProperNoun); showSemantic unconditionally true.
//   - 皇城 (phrases): allowAsPatternVariable + semanticType, no allowedVariableTypes —
//     commitTranslation's 2nd variant; VAR badge clickable + active.
//   - 大城 (phrases): allowAsPatternVariable + semanticType + allowedVariableTypes —
//     commitTranslation's 3rd variant.
//   - 小城 (phrases): no metadata — showSemantic false (not properNoun, VAR off); VAR
//     badge clickable + inactive (toggle-on path).
const DICTIONARIES: Record<string, DictionaryData> = {
  'properNouns-f_test': {
    南京城: { translation: 'Nam Kinh Thanh' },
  },
  phrases: {
    皇城: { translation: 'hoang thanh', allowAsPatternVariable: true, semanticType: 'concept' },
    大城: {
      translation: 'dai thanh',
      allowAsPatternVariable: true,
      semanticType: 'location',
      allowedVariableTypes: { X: ['character'] },
    },
    小城: { translation: 'tieu thanh' },
  },
};

function getRowForSource(source: string): HTMLElement {
  const cell = screen.getByText(source);
  const row = cell.closest('[role="row"]');
  if (!row) throw new Error(`No row found for source "${source}"`);
  return row as HTMLElement;
}

function renderModal(overrides: Partial<React.ComponentProps<typeof RuleMatchesModal>> = {}) {
  const updateEntry = vi.fn().mockResolvedValue(undefined);
  const deleteEntry = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <RuleMatchesModal
      rule={RULE}
      dictionaries={DICTIONARIES}
      updateEntry={updateEntry}
      deleteEntry={deleteEntry}
      onClose={onClose}
      {...overrides}
    />
  );
  return { updateEntry, deleteEntry, onClose };
}

describe('RuleMatchesModal — commitTranslation metadata merge', () => {
  test('entry with no metadata: merges allowAsPatternVariable only', async () => {
    const { updateEntry } = renderModal();

    fireEvent.click(screen.getByText('Nam Kinh Thanh'));
    const input = screen.getByLabelText('Translation for 南京城');
    fireEvent.change(input, { target: { value: 'Nam Kinh Thanh moi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith(
      'properNouns-f_test',
      '南京城',
      '南京城',
      'Nam Kinh Thanh moi',
      { allowAsPatternVariable: false }
    );
  });

  test('entry with allowAsPatternVariable + semanticType: merges both, omits allowedVariableTypes', async () => {
    const { updateEntry } = renderModal();

    fireEvent.click(screen.getByText('hoang thanh'));
    const input = screen.getByLabelText('Translation for 皇城');
    fireEvent.change(input, { target: { value: 'hoang thanh moi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith('phrases', '皇城', '皇城', 'hoang thanh moi', {
      allowAsPatternVariable: true,
      semanticType: 'concept',
    });
  });

  test('entry with allowAsPatternVariable + semanticType + allowedVariableTypes: merges all three', async () => {
    const { updateEntry } = renderModal();

    fireEvent.click(screen.getByText('dai thanh'));
    const input = screen.getByLabelText('Translation for 大城');
    fireEvent.change(input, { target: { value: 'dai thanh moi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith('phrases', '大城', '大城', 'dai thanh moi', {
      allowAsPatternVariable: true,
      semanticType: 'location',
      allowedVariableTypes: { X: ['character'] },
    });
  });
});

describe('RuleMatchesModal — VAR badge', () => {
  test('properNouns entry: renders non-clickable "✓ VAR", clicking it does not call updateEntry', () => {
    const { updateEntry } = renderModal();
    const row = getRowForSource('南京城');

    const badge = within(row).getByText('✓ VAR');
    expect(badge).toHaveAttribute(
      'title',
      'Proper noun entries are always usable as variables — not toggleable here'
    );
    fireEvent.click(badge);

    expect(updateEntry).not.toHaveBeenCalled();
  });

  test('phrases entry with allowAsPatternVariable=true: renders active clickable badge', async () => {
    const { updateEntry } = renderModal();
    const row = getRowForSource('皇城');

    fireEvent.click(within(row).getByText('✓ VAR'));

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith(
      'phrases',
      '皇城',
      '皇城',
      'hoang thanh',
      expect.objectContaining({ allowAsPatternVariable: false })
    );
  });

  test('phrases entry with allowAsPatternVariable=false: renders inactive clickable badge, toggles on', async () => {
    const { updateEntry } = renderModal();
    const row = getRowForSource('小城');

    fireEvent.click(within(row).getByText('VAR'));

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith(
      'phrases',
      '小城',
      '小城',
      'tieu thanh',
      expect.objectContaining({ allowAsPatternVariable: true })
    );
  });
});

describe('RuleMatchesModal — showSemantic conditional', () => {
  test('properNouns entry: Semantic cell renders unconditionally', () => {
    renderModal();
    const row = getRowForSource('南京城');
    expect(within(row).getByTitle('Set as location')).toBeInTheDocument();
  });

  test('phrases entry with allowAsPatternVariable=true: Semantic cell renders', () => {
    renderModal();
    const row = getRowForSource('皇城');
    // Active type is 'concept' for this row — its chip shows the "click to remove" title.
    expect(within(row).getByTitle('concept (click to remove)')).toBeInTheDocument();
  });

  test('phrases entry with allowAsPatternVariable=false: Semantic cell renders nothing', () => {
    renderModal();
    const row = getRowForSource('小城');
    expect(within(row).queryByTitle(/Set as|click to remove/)).not.toBeInTheDocument();
  });
});

describe('RuleMatchesModal — Semantic toggle wiring', () => {
  test('selecting a semantic type calls updateEntry', async () => {
    const { updateEntry } = renderModal();
    const row = getRowForSource('南京城');

    fireEvent.click(within(row).getByTitle('Set as location'));

    await vi.waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    expect(updateEntry).toHaveBeenCalledWith(
      'properNouns-f_test',
      '南京城',
      '南京城',
      'Nam Kinh Thanh',
      expect.objectContaining({ semanticType: 'location' })
    );
  });
});

describe('RuleMatchesModal — empty state', () => {
  test('renders the empty message and no table when nothing matches', () => {
    renderModal({ dictionaries: { phrases: { 山脉: { translation: 'day nui' } } } });

    expect(screen.getByText('No dictionary entries match this rule yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('RuleMatchesModal — right-click menu', () => {
  test('offers Move and Delete but no Edit (fields already edit inline)', () => {
    renderModal();
    fireEvent.contextMenu(getRowForSource('小城'));
    const menu = screen.getByRole('menu', { name: 'Entry actions' });
    expect(within(menu).getByText('Move to...')).toBeInTheDocument();
    expect(within(menu).getByText('Delete Entry')).toBeInTheDocument();
    expect(within(menu).queryByText('Edit Entry')).toBeNull();
  });

  test('Delete needs a second click, then deletes from the row’s own dictionary', async () => {
    const { deleteEntry } = renderModal();
    fireEvent.contextMenu(getRowForSource('南京城'));
    await act(async () => {
      fireEvent.click(screen.getByText('Delete Entry'));
    });
    expect(deleteEntry).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText('Click again to delete'));
    });
    expect(deleteEntry).toHaveBeenCalledWith('properNouns-f_test', '南京城');
  });

  test('Move to... opens the move dialog for that entry and dictionary', () => {
    renderModal();
    fireEvent.contextMenu(getRowForSource('皇城'));
    fireEvent.click(screen.getByText('Move to...'));
    expect(screen.getByTestId('move-dialog')).toHaveTextContent('皇城|phrases');
  });
});

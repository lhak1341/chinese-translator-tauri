import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RulesManager from '../RulesManager';
import type { RulesManagerHandle } from '../RulesManager';
import type { TransformRule } from '../../../types/TransformRuleTypes';

const { loadTransformRules, saveTransformRules } = vi.hoisted(() => ({
  loadTransformRules: vi.fn(),
  saveTransformRules: vi.fn(),
}));

vi.mock('../../../utils/dictionary/TransformRuleBackend', () => ({
  loadTransformRules,
  saveTransformRules,
}));

vi.mock('../../../utils/toast', () => ({ default: { error: vi.fn() } }));

const mockUpdateEntry = vi.fn().mockResolvedValue(undefined);

vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => ({
    dictionaries: {
      phrases: { 南京城: { translation: 'Nam Kinh Thanh' } },
    },
    updateEntry: mockUpdateEntry,
  }),
}));

function makeRule(overrides: Partial<TransformRule> = {}): TransformRule {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '城',
    moveWords: 1,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    label: 'City suffix',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadTransformRules.mockResolvedValue([]);
  saveTransformRules.mockResolvedValue(undefined);
});

describe('RulesManager', () => {
  test('shows empty state when there are no rules', async () => {
    render(<RulesManager />);
    expect(await screen.findByText(/No rules yet/)).toBeInTheDocument();
  });

  test('renders existing rules in the table', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);

    expect(await screen.findByText('城')).toBeInTheDocument();
    expect(screen.getByText('City suffix')).toBeInTheDocument();
  });

  test('rows are sorted by key, then by semantic type', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'r1', key: '市', semanticType: 'location', label: 'r1' }),
      makeRule({ id: 'r2', key: '城', semanticType: 'object', label: 'r2' }),
      makeRule({ id: 'r3', key: '城', semanticType: 'location', label: 'r3' }),
      makeRule({ id: 'r4', key: '卫城', semanticType: 'location', label: 'r4' }),
    ]);
    render(<RulesManager />);
    await screen.findByText('市');

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    const labelsInOrder = rows.map((row) => row.textContent);
    // longer key first: "卫城" (2 chars, r4) before any 1-char key, regardless of alphabetical order;
    // then within same length, key alphabetical, then semantic type: r3 < r2 < r1
    expect(labelsInOrder[0]).toContain('r4');
    expect(labelsInOrder[1]).toContain('r3');
    expect(labelsInOrder[2]).toContain('r2');
    expect(labelsInOrder[3]).toContain('r1');
  });

  test('adding a rule via the modal defaults Move to 0 and syncs Capitalize-except-N to the key length', async () => {
    render(<RulesManager />);
    await waitFor(() => expect(screen.queryByText(/Loading rules/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Add Rule'));
    expect(screen.getByLabelText('Move N words')).toHaveValue(0);

    fireEvent.change(screen.getByLabelText(/Key \(1-4/), { target: { value: '卫城' } });
    expect(screen.getByLabelText('Capitalize except N')).toHaveValue(2);

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveTransformRules).toHaveBeenCalled());
    expect(await screen.findByText('卫城')).toBeInTheDocument();
  });

  test('imperative openNew() (wired to the Cmd-7 hotkey) opens the modal prefilled with the given text as Key, truncated to 4 chars', async () => {
    const ref = React.createRef<RulesManagerHandle>();
    render(<RulesManager ref={ref} />);
    await waitFor(() => expect(screen.queryByText(/Loading rules/)).not.toBeInTheDocument());

    act(() => ref.current?.openNew('太岳山脉的传说'));

    expect(screen.getByLabelText(/Key \(1-4/)).toHaveValue('太岳山脉');
    expect(screen.getByLabelText('Capitalize except N')).toHaveValue(4);
  });

  test('imperative openNew() with no text opens a blank modal, same as clicking Add Rule', async () => {
    const ref = React.createRef<RulesManagerHandle>();
    render(<RulesManager ref={ref} />);
    await waitFor(() => expect(screen.queryByText(/Loading rules/)).not.toBeInTheDocument());

    act(() => ref.current?.openNew());

    expect(screen.getByLabelText(/Key \(1-4/)).toHaveValue('');
  });

  test('adding a rule with a Replace-moved-words value saves it on the rule', async () => {
    render(<RulesManager />);
    await waitFor(() => expect(screen.queryByText(/Loading rules/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Add Rule'));
    fireEvent.change(screen.getByLabelText(/Key \(1-4/), { target: { value: '城' } });
    fireEvent.change(screen.getByLabelText(/Replace moved words with/), {
      target: { value: 'thanh pho' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([
        expect.objectContaining({ moveReplacement: 'thanh pho' }),
      ])
    );
  });

  test('filter panel filters rows by semantic type, and toggling off clears it', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'r1', key: '城', label: 'City', semanticType: 'location' }),
      makeRule({ id: 'r2', key: '卫', label: 'Guard', semanticType: 'object' }),
    ]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByTitle('Filter by semantic type'));
    fireEvent.click(screen.getByLabelText('Filter by Object'));

    expect(screen.queryByText('城')).not.toBeInTheDocument();
    expect(screen.getByText('卫')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Filter by Object'));
    expect(screen.getByText('城')).toBeInTheDocument();
  });

  test('editing the Replace cell inline commits the new value', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);
    const cell = await screen.findByLabelText('Replace-moved-words for City suffix');

    fireEvent.click(cell);
    const input = screen.getByLabelText('Replace-moved-words for City suffix');
    fireEvent.change(input, { target: { value: 'dãy núi' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([
        expect.objectContaining({ moveReplacement: 'dãy núi' }),
      ])
    );
  });

  test('saving a new rule with a colliding matchKind+key shows an inline error and blocks Save', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'existing', key: '城', label: 'City suffix' }),
    ]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByText('Add Rule'));
    fireEvent.change(screen.getByLabelText(/Key \(1-4/), { target: { value: '城' } });

    expect(await screen.findByText(/Conflicts with existing rule/)).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('search filters rows by key or label, and shows a matching-search empty state', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'r1', key: '城', label: 'City suffix' }),
      makeRule({ id: 'r2', key: '卫', label: 'Guard prefix' }),
    ]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.change(screen.getByLabelText('Search rules'), { target: { value: 'guard' } });

    expect(screen.queryByText('城')).not.toBeInTheDocument();
    expect(screen.getByText('卫')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search rules'), { target: { value: 'nomatch' } });
    expect(await screen.findByText(/No rules matching "nomatch"/)).toBeInTheDocument();
  });

  test('deleting a rule removes it from the table', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByLabelText('Delete City suffix'));

    await waitFor(() => expect(screen.queryByText('城')).not.toBeInTheDocument());
    expect(saveTransformRules).toHaveBeenCalledWith([]);
  });

  test('toggling the enabled checkbox flips the rule and persists it', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ enabled: true })]);
    render(<RulesManager />);
    const checkbox = await screen.findByLabelText(/Toggle City suffix enabled/);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([expect.objectContaining({ enabled: false })])
    );
  });

  test('editing the Key inline click-to-edits and commits on blur', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);
    const keyCell = await screen.findByLabelText('Key for City suffix');

    fireEvent.click(keyCell);
    const input = screen.getByLabelText('Key for City suffix');
    fireEvent.change(input, { target: { value: '卫城' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([expect.objectContaining({ key: '卫城' })])
    );
  });

  test('editing Move inline commits the new number', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ moveWords: 1 })]);
    render(<RulesManager />);
    const moveCell = await screen.findByLabelText('Move N words for City suffix');

    fireEvent.click(moveCell);
    const input = screen.getByLabelText('Move N words for City suffix');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([expect.objectContaining({ moveWords: 2 })])
    );
  });

  test('clicking the Match toggle commits immediately, no click-to-edit needed', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ matchKind: 'suffix' })]);
    render(<RulesManager />);
    const prefixToggle = await screen.findByLabelText('Set prefix for City suffix');

    fireEvent.click(prefixToggle);

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([
        expect.objectContaining({ matchKind: 'prefix' }),
      ])
    );
  });

  test('no Edit button or reorder controls exist — everything is inline', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);
    await screen.findByText('城');

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
  });

  test('clicking a semantic type toggle badge commits the new type', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ semanticType: 'location' })]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByLabelText('Set Object for City suffix'));

    await waitFor(() =>
      expect(saveTransformRules).toHaveBeenCalledWith([
        expect.objectContaining({ semanticType: 'object' }),
      ])
    );
  });

  test('clicking the already-active semantic type badge is a no-op', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ semanticType: 'location' })]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByLabelText('Set Location for City suffix'));

    expect(saveTransformRules).not.toHaveBeenCalled();
  });

  test('delete button is an icon (Trash2), not text', async () => {
    loadTransformRules.mockResolvedValue([makeRule()]);
    render(<RulesManager />);
    const deleteButton = await screen.findByLabelText('Delete City suffix');
    expect(deleteButton.querySelector('svg')).toBeInTheDocument();
    expect(deleteButton.textContent).toBe('');
  });

  test('clicking the magnifier opens a modal listing matching dictionary entries', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ matchKind: 'suffix', key: '城' })]);
    render(<RulesManager />);
    await screen.findByText('城');

    fireEvent.click(screen.getByLabelText('View matching entries for City suffix'));

    expect(await screen.findByText('南京城')).toBeInTheDocument();
    expect(screen.getByText('Nam Kinh Thanh')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to Rules'));
    expect(screen.queryByText('南京城')).not.toBeInTheDocument();
  });
});

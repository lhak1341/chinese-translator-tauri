/**
 * The Candidate finder panel's four states and the buttons each one offers. What closing
 * does to a run belongs to the owner (`BookReader`, `CandidateFinderStore`), not here.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CandidateFinderPanel from '../CandidateFinderPanel';
import type { CandidateFinderSnapshot } from '../../../utils/reader/CandidateFinderStore';
import type { CandidateAdder } from '../../../utils/reader/CandidateAdd';
import type { CandidateDismissals } from '../../../hooks/useCandidateFinder';

function makeAdder(overrides: Partial<CandidateAdder> = {}): CandidateAdder {
  return {
    opened: 'properNouns-f_Novel',
    choices: ['properNouns', 'properNouns-f_Novel'],
    isAdded: () => false,
    guess: (text) => `guess:${text}`,
    add: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDismissals(overrides: Partial<CandidateDismissals> = {}): CandidateDismissals {
  return {
    names: [],
    unreadable: null,
    canDismiss: true,
    dismiss: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPanel(
  snapshot: CandidateFinderSnapshot,
  adder: CandidateAdder = makeAdder(),
  dismissals: CandidateDismissals = makeDismissals()
) {
  const handlers = { onRun: vi.fn(), onCancel: vi.fn(), onClose: vi.fn() };
  render(
    <CandidateFinderPanel snapshot={snapshot} adder={adder} dismissals={dismissals} {...handlers} />
  );
  return handlers;
}

describe('CandidateFinderPanel', () => {
  test('not run: says what it does and that nothing is written, and offers Run', () => {
    const { onRun } = renderPanel({ status: 'idle' });
    expect(screen.getByText(/Nothing is written to any dictionary/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('running: shows the stage and percent, and Cancel', () => {
    const { onCancel } = renderPanel({ status: 'running', stage: 'counting', percent: 42 });
    expect(screen.getByRole('status').textContent).toBe('Counting · 42%');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('results: one row per candidate with its count and line count, in the order given', () => {
    renderPanel({
      status: 'done',
      candidates: [
        { text: '滕青山', count: 32, lineCount: 31, alsoIn: [] },
        { text: '云梦泽', count: 12, lineCount: 12, alsoIn: [] },
      ],
    });
    const rows = screen
      .getAllByRole('listitem')
      .map((row) => [...row.querySelectorAll(':scope > span')].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['滕青山', '32', '31'],
      ['云梦泽', '12', '12'],
    ]);
  });

  test('a candidate held by an inactive dictionary carries an "in X, not active here" tag', () => {
    renderPanel({
      status: 'done',
      candidates: [
        { text: '滕青山', count: 32, lineCount: 31, alsoIn: ['properNouns-f_Novel'] },
        { text: '云梦泽', count: 12, lineCount: 12, alsoIn: [] },
      ],
    });
    expect(screen.getAllByText(/not active here/).map((tag) => tag.textContent)).toEqual([
      'in f_Novel, not active here',
    ]);
  });

  test('empty result: says no new names were found, and offers Run again', () => {
    const { onRun } = renderPanel({ status: 'done', candidates: [] });
    expect(screen.getByText('No new names found.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('a failed run shows its message and offers Run again', () => {
    renderPanel({ status: 'error', message: 'A different book is open' });
    expect(screen.getByText('A different book is open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
  });

  test('close calls onClose', () => {
    const { onClose } = renderPanel({ status: 'idle' });
    fireEvent.click(screen.getByLabelText('Close candidate finder'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('add one candidate', () => {
    const done = (...texts: string[]): CandidateFinderSnapshot => ({
      status: 'done',
      candidates: texts.map((text) => ({ text, count: 5, lineCount: 4, alsoIn: [] })),
    });

    test('the row is pre-filled with the Add form guess and opens on the fiction dictionary', () => {
      renderPanel(done('滕青山'));
      expect((screen.getByLabelText('Translation of 滕青山') as HTMLInputElement).value).toBe(
        'guess:滕青山'
      );
      const select = screen.getByLabelText('Add 滕青山 to') as HTMLSelectElement;
      expect(select.value).toBe('properNouns-f_Novel');
      expect([...select.options].map((o) => o.value)).toEqual([
        'properNouns',
        'properNouns-f_Novel',
      ]);
    });

    test('Add writes the edited translation to the chosen dictionary', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Add 滕青山 to'), {
        target: { value: 'properNouns' },
      });
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), {
        target: { value: 'Đằng Thanh Sơn' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(adder.add).toHaveBeenCalledWith('滕青山', 'properNouns', 'Đằng Thanh Sơn');
    });

    test('Enter in the translation field adds', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.keyDown(screen.getByLabelText('Translation of 滕青山'), { key: 'Enter' });
      expect(adder.add).toHaveBeenCalledWith('滕青山', 'properNouns-f_Novel', 'guess:滕青山');
    });

    test('nothing is written until Add is pressed', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), { target: { value: 'x' } });
      expect(adder.add).not.toHaveBeenCalled();
    });

    test('a refused add keeps the row and shows the message', async () => {
      const adder = makeAdder({ add: vi.fn().mockRejectedValue(new Error('Cannot save')) });
      renderPanel(done('滕青山'), adder);
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();
    });

    test('a row already added leaves the list and is counted, and returns when no longer added', () => {
      const added = new Set(['云梦泽']);
      const adder = makeAdder({ isAdded: (text) => added.has(text) });
      const snapshot = done('滕青山', '云梦泽');
      const { rerender } = render(
        <CandidateFinderPanel
          snapshot={snapshot}
          adder={adder}
          dismissals={makeDismissals()}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Translation of 云梦泽')).toBeNull();
      expect(screen.getByText('1 added since this run, re-run to update')).toBeTruthy();

      added.clear();
      rerender(
        <CandidateFinderPanel
          snapshot={snapshot}
          adder={{ ...adder }}
          dismissals={makeDismissals()}
          onRun={vi.fn()}
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Translation of 云梦泽')).toBeTruthy();
      expect(screen.queryByText(/added since this run/)).toBeNull();
    });

    test('the notice stays when every row has been added', async () => {
      renderPanel(done('滕青山'), makeAdder({ isAdded: () => true }));
      await waitFor(() =>
        expect(screen.getByText('1 added since this run, re-run to update')).toBeTruthy()
      );
    });

    test('an empty translation is refused on the row without calling add', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.change(screen.getByLabelText('Translation of 滕青山'), { target: { value: ' ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add 滕青山' }));
      expect(adder.add).not.toHaveBeenCalled();
      expect(screen.getByText('Enter a translation first')).toBeTruthy();
    });

    test('the Enter that commits an IME composition does not add', () => {
      const adder = makeAdder();
      renderPanel(done('滕青山'), adder);
      fireEvent.keyDown(screen.getByLabelText('Translation of 滕青山'), {
        key: 'Enter',
        keyCode: 229,
      });
      expect(adder.add).not.toHaveBeenCalled();
    });

    test('two quick Enters add once', () => {
      const adder = makeAdder({ add: vi.fn(() => new Promise<void>(() => {})) });
      renderPanel(done('滕青山'), adder);
      const input = screen.getByLabelText('Translation of 滕青山');
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(adder.add).toHaveBeenCalledOnce();
    });
  });
  describe('dismiss and restore', () => {
    const done = (...texts: string[]): CandidateFinderSnapshot => ({
      status: 'done',
      candidates: texts.map((text) => ({ text, count: 5, lineCount: 4, alsoIn: [] })),
    });

    test('× dismisses that name', () => {
      const dismissals = makeDismissals();
      renderPanel(done('滕青山', '云梦泽'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 滕青山' }));
      expect(dismissals.dismiss).toHaveBeenCalledWith('滕青山');
    });

    test('a dismissed name has no row, and sits in a collapsed list with Restore', () => {
      const dismissals = makeDismissals({ names: ['云梦泽'] });
      renderPanel(done('滕青山', '云梦泽'), makeAdder(), dismissals);
      expect(screen.queryByLabelText('Translation of 云梦泽')).toBeNull();
      expect(screen.getByLabelText('Translation of 滕青山')).toBeTruthy();

      const list = screen.getByText('Dismissed (1)').closest('details') as HTMLDetailsElement;
      expect(list.open).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Restore 云梦泽' }));
      expect(dismissals.restore).toHaveBeenCalledWith('云梦泽');
    });

    test('with nothing dismissed there is no list', () => {
      renderPanel(done('滕青山'));
      expect(screen.queryByText(/Dismissed/)).toBeNull();
    });

    test('unreadable records: × is disabled and the message is shown', () => {
      const dismissals = makeDismissals({
        canDismiss: false,
        unreadable: "Couldn't read books.json; not saving over it",
      });
      renderPanel(done('滕青山'), makeAdder(), dismissals);
      expect(
        (screen.getByRole('button', { name: 'Dismiss 滕青山' }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(screen.getByText("Couldn't read books.json; not saving over it")).toBeTruthy();
    });

    test('a refused restore shows the message', async () => {
      const dismissals = makeDismissals({
        names: ['云梦泽'],
        restore: vi.fn().mockRejectedValue(new Error('Cannot save')),
      });
      renderPanel(done('云梦泽'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Restore 云梦泽' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
    });

    test('a refused dismiss shows the message on the row', async () => {
      const dismissals = makeDismissals({
        dismiss: vi.fn().mockRejectedValue(new Error('Cannot save')),
      });
      renderPanel(done('滕青山'), makeAdder(), dismissals);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss 滕青山' }));
      expect(await screen.findByText('Cannot save')).toBeTruthy();
    });
  });
});

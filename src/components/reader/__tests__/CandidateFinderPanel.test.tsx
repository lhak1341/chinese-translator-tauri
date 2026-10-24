/**
 * The Candidate finder panel's four states and the buttons each one offers. What closing
 * does to a run belongs to the owner (`BookReader`, `CandidateFinderStore`), not here.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CandidateFinderPanel from '../CandidateFinderPanel';
import type { CandidateFinderSnapshot } from '../../../utils/reader/CandidateFinderStore';

function renderPanel(snapshot: CandidateFinderSnapshot) {
  const handlers = { onRun: vi.fn(), onCancel: vi.fn(), onClose: vi.fn() };
  render(<CandidateFinderPanel snapshot={snapshot} {...handlers} />);
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
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['滕青山3231', '云梦泽1212']);
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
});

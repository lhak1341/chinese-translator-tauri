/**
 * The palette's own behaviour: it lists what it was handed, typing filters, Escape
 * closes, and choosing a row runs that row's action and closes. Which rows exist, and
 * which shortcut each one displays, is `PaletteCommands`' job and is tested there.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CommandPalette from '../CommandPalette';
import type { PaletteCommand } from '../../../utils/reader/PaletteCommands';

function commands(overrides: Partial<PaletteCommand>[] = []): PaletteCommand[] {
  const base: PaletteCommand[] = [
    { id: 'jump', label: 'Jump to chapter', hint: 'Cmd/Ctrl+G', group: 'Navigate', run: vi.fn() },
    {
      id: 'reload',
      label: 'Reload dictionaries',
      hint: 'Cmd/Ctrl+R',
      group: 'Dictionaries',
      run: vi.fn(),
    },
    { id: 'book', label: 'Switch to Another Novel', group: 'Books', run: vi.fn() },
  ];
  return base.map((command, index) => ({ ...command, ...overrides[index] }));
}

function open(list: PaletteCommand[], onClose = vi.fn()) {
  render(<CommandPalette commands={list} onClose={onClose} />);
  return { onClose, search: screen.getByRole('textbox', { name: /command/i }) };
}

describe('CommandPalette', () => {
  test('lists every command, each with its shortcut hint', () => {
    open(commands());
    expect(screen.getByText('Jump to chapter')).toBeTruthy();
    expect(screen.getByText('Cmd/Ctrl+G')).toBeTruthy();
    expect(screen.getByText('Switch to Another Novel')).toBeTruthy();
  });

  test('typing filters the list', () => {
    const { search } = open(commands());
    fireEvent.change(search, { target: { value: 'reload' } });
    expect(screen.getByText('Reload dictionaries')).toBeTruthy();
    expect(screen.queryByText('Jump to chapter')).toBeNull();
  });

  test('a query that matches nothing says so instead of showing an empty box', () => {
    const { search } = open(commands());
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText(/no commands match/i)).toBeTruthy();
  });

  test('Escape closes', () => {
    const { search, onClose } = open(commands());
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking a row runs it and closes', () => {
    const run = vi.fn();
    const { onClose } = open(commands([{}, { run }]));
    fireEvent.click(screen.getByText('Reload dictionaries'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Enter runs the highlighted row — the first one until the arrows move it', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { search } = open(commands([{ run: first }, { run: second }]));
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  test('the highlight stays inside the filtered list when it shrinks under it', () => {
    const reload = vi.fn();
    const { search } = open(commands([{}, { run: reload }]));
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.change(search, { target: { value: 'reload' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('Enter with nothing matching does nothing at all', () => {
    const run = vi.fn();
    const { search, onClose } = open(commands([{ run }]));
    fireEvent.change(search, { target: { value: 'zzzz' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

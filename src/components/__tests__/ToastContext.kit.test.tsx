/**
 * The app's toasts render through the kit's stack (@lhak/style ToastProvider, kit issue 13):
 * each status shows its icon named by a word, a custom ID replaces the toast it names
 * instead of stacking a second one, and a duration of 0 keeps the toast.
 */

import { describe, test, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import React, { useEffect } from 'react';
import { ToastProvider, useToast } from '../ToastContext';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount() {
  const api: { current: ReturnType<typeof useToast> | null } = { current: null };
  function Grab() {
    const toast = useToast();
    useEffect(() => {
      api.current = toast;
    });
    return null;
  }
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>
  );
  return () => api.current!;
}

describe('ToastProvider on the kit', () => {
  test('each status shows its icon named by a word', () => {
    const toast = mount();
    act(() => {
      toast().error('Could not save');
      toast().warning('Cache degraded');
      toast().success('Saved');
    });
    const icon = (name: string) =>
      within(screen.getByRole('dialog', { name })).getByRole('img').getAttribute('aria-label');
    expect(icon('Could not save')).toBe('Error');
    expect(icon('Cache degraded')).toBe('Warning');
    expect(icon('Saved')).toBe('Success');
  });

  test('a custom ID replaces the toast it names', () => {
    const toast = mount();
    act(() => {
      toast().warning('Reloading…', undefined, 'dict-reload');
      toast().success('Reloaded', undefined, 'dict-reload');
    });
    expect(screen.queryByRole('dialog', { name: 'Reloading…' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Reloaded' })).toBeTruthy();
  });

  test('closes after the kit default 4 s; a duration of 0 keeps it', async () => {
    vi.useFakeTimers();
    const toast = mount();
    act(() => {
      toast().success('Saved');
      toast().error('Engine failed', 0);
    });
    await act(() => vi.advanceTimersByTimeAsync(4500));
    expect(screen.queryByRole('dialog', { name: 'Saved' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Engine failed' })).toBeTruthy();
  });
});

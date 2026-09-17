import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppearanceRelayout, type RelayoutPanel } from '../useAppearanceRelayout';
import type { ReadingPosition } from '../../types/ReaderTypes';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

function panel(): RelayoutPanel & {
  virtualizer: { measure: ReturnType<typeof vi.fn>; scrollToIndex: ReturnType<typeof vi.fn> };
} {
  const element = document.createElement('div');
  // jsdom reports every element as zero-height; `tryRestorePosition` refuses to act on
  // one, so the panel has to claim a real viewport.
  Object.defineProperty(element, 'clientHeight', { value: 600, configurable: true });
  return {
    virtualizer: {
      measure: vi.fn(),
      scrollToIndex: vi.fn(),
      getVirtualItems: () => [],
    },
    scrollRef: { current: element },
  } as never;
}

function changeAppearance(): void {
  document.documentElement.style.setProperty('--full-translation-size', '1.5rem');
}

const anchor: ReadingPosition = { line: 4200, fraction: 0 };

describe('useAppearanceRelayout', () => {
  it('measures nothing before the first appearance change', () => {
    const master = panel();
    renderHook(() =>
      useAppearanceRelayout({
        isEnabled: true,
        anchorRef: { current: anchor },
        panels: [master],
        lineCount: 75000,
      })
    );
    expect(master.virtualizer.measure).not.toHaveBeenCalled();
  });

  it('throws away every panel’s measurement cache when the font changes', async () => {
    const panels = [panel(), panel(), panel()];
    renderHook(() =>
      useAppearanceRelayout({
        isEnabled: true,
        anchorRef: { current: anchor },
        panels,
        lineCount: 75000,
      })
    );

    changeAppearance();

    await waitFor(() => expect(panels[0].virtualizer.measure).toHaveBeenCalledTimes(1));
    expect(panels[1].virtualizer.measure).toHaveBeenCalledTimes(1);
    expect(panels[2].virtualizer.measure).toHaveBeenCalledTimes(1);
  });

  it('puts the reader back on the line they were on, on the master panel', async () => {
    const master = panel();
    const follower = panel();
    renderHook(() =>
      useAppearanceRelayout({
        isEnabled: true,
        anchorRef: { current: anchor },
        panels: [master, follower],
        lineCount: 75000,
      })
    );

    changeAppearance();

    await waitFor(() =>
      expect(master.virtualizer.scrollToIndex).toHaveBeenCalledWith(4200, { align: 'start' })
    );
    // The followers are pulled level by the panel sync, not by a second restore here.
    expect(follower.virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does nothing while the Reader is a background tab', async () => {
    const master = panel();
    renderHook(() =>
      useAppearanceRelayout({
        isEnabled: false,
        anchorRef: { current: anchor },
        panels: [master],
        lineCount: 75000,
      })
    );

    changeAppearance();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(master.virtualizer.measure).not.toHaveBeenCalled();
    expect(master.virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('still re-measures when there is no anchor yet, but restores nothing', async () => {
    const master = panel();
    renderHook(() =>
      useAppearanceRelayout({
        isEnabled: true,
        anchorRef: { current: null },
        panels: [master],
        lineCount: 75000,
      })
    );

    changeAppearance();

    await waitFor(() => expect(master.virtualizer.measure).toHaveBeenCalledTimes(1));
    expect(master.virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });
});

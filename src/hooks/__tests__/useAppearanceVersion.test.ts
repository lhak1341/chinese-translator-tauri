import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppearanceVersion } from '../useAppearanceVersion';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('useAppearanceVersion', () => {
  it('starts at zero — the initial render is not a change', () => {
    const { result } = renderHook(() => useAppearanceVersion());
    expect(result.current).toBe(0);
  });

  it('bumps when the appearance vars are written to the root element', async () => {
    const { result } = renderHook(() => useAppearanceVersion());

    document.documentElement.style.setProperty('--chinese-text-size', '1.5rem');

    await waitFor(() => expect(result.current).toBe(1));
  });

  it('bumps once for a whole settings object, not once per property', async () => {
    const { result } = renderHook(() => useAppearanceVersion());

    // Exactly how `applyAppearanceToCssVars` writes: several properties, synchronously.
    document.documentElement.style.setProperty('--chinese-text-font', 'SimSun');
    document.documentElement.style.setProperty('--chinese-text-size', '1.5rem');
    document.documentElement.style.setProperty('--full-translation-size', '1.5rem');

    await waitFor(() => expect(result.current).toBe(1));
    expect(result.current).toBe(1);
  });

  it('stops watching once unmounted', async () => {
    const { result, unmount } = renderHook(() => useAppearanceVersion());
    unmount();

    document.documentElement.style.setProperty('--ui-font', 'Inter');
    await Promise.resolve();

    expect(result.current).toBe(0);
  });
});

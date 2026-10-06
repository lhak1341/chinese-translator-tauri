import { describe, expect, test, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppConfig } from '../useAppConfig';
import { DEFAULT_APP_CONFIG, invalidateAppConfig, saveAppConfig } from '../../utils/appConfig';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';

let disk: ReturnType<typeof installFakeConfigDisk>;

beforeEach(() => {
  disk = installFakeConfigDisk({ activeProperNouns: ['properNouns', 'properNouns-_A'] });
});

describe('useAppConfig', () => {
  test('starts a load and settles on what the file holds', async () => {
    const { result } = renderHook(() => useAppConfig());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.config.engine.activeProperNouns).toEqual([
      'properNouns',
      'properNouns-_A',
    ]);
  });

  test('follows a save made elsewhere, the moment it lands', async () => {
    const { result } = renderHook(() => useAppConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-_A' } });
    });

    expect(result.current.config.ui.defaultQuickAddDictionary).toBe('properNouns-_A');
  });

  test('serves the last config it saw while an invalidate waits for the reload', async () => {
    const { result } = renderHook(() => useAppConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    disk.disk.raw.activeProperNouns = ['properNouns-_B'];
    act(() => invalidateAppConfig());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.config.engine.activeProperNouns).toEqual([
      'properNouns',
      'properNouns-_A',
    ]);
    await waitFor(() =>
      expect(result.current.config.engine.activeProperNouns).toEqual(['properNouns-_B'])
    );
  });

  test('an unreadable config.json shows the defaults and stops loading', async () => {
    disk.loadConfiguration.mockResolvedValueOnce({ success: false, error: 'unreadable' } as never);

    const { result } = renderHook(() => useAppConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config).toBe(DEFAULT_APP_CONFIG);
  });
});

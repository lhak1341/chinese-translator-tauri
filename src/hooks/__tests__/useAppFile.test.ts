import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createAppFile, type AppFile } from '../../utils/appFile';
import { useAppFile } from '../useAppFile';

vi.mock('../../utils/toast', () => ({ default: { warning: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let onDisk: string[];
let load: ReturnType<typeof vi.fn>;
let file: AppFile<string[]>;

beforeEach(() => {
  onDisk = ['a'];
  load = vi.fn(async () => ({ success: true, data: [...onDisk] }));
  file = createAppFile<string[]>({
    fileName: 'items.json',
    what: 'Items (items.json)',
    load,
    save: async () => ({ success: true }),
    parse: (data) => ({ value: Array.isArray(data) ? (data as string[]) : [], dropped: 0 }),
    onUnreadable: 'throw',
    saveError: 'Failed to save items',
  });
});

describe('useAppFile', () => {
  test('starts a load when nothing is cached, and settles on the file', async () => {
    const { result } = renderHook(() => useAppFile(file.readable));
    expect(result.current.status).toBe('unloaded');
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'loaded', value: ['a'], reason: null })
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('does not load a file already cached', async () => {
    await file.read();
    const { result } = renderHook(() => useAppFile(file.readable));
    expect(result.current.value).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('loads again after an invalidate', async () => {
    const { result } = renderHook(() => useAppFile(file.readable));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    onDisk = ['b'];
    act(() => file.invalidate());
    await waitFor(() => expect(result.current.value).toEqual(['b']));
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('an unreadable file ends the load with its reason and is not retried', async () => {
    load.mockResolvedValue({ success: false, error: 'EACCES' });
    const { result } = renderHook(() => useAppFile(file.readable));
    await waitFor(() => expect(result.current.status).toBe('unreadable'));
    expect(result.current.reason).toMatch(/not saving over it/);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('a selector re-renders only when what it selects changes', async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useAppFile(file.readable, (state) => state.status);
    });
    await waitFor(() => expect(result.current).toBe('loaded'));
    const settled = renders;

    await act(() => file.transform((current) => ({ value: [...current, 'c'], result: null })));
    expect(renders).toBe(settled);
  });
});

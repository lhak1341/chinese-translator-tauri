import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInlineFieldEdit } from '../useInlineFieldEdit';

describe('useInlineFieldEdit', () => {
  let onCommit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onCommit = vi.fn().mockResolvedValue(undefined);
  });

  it('starts non-editing with tempValue matching currentValue', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    expect(result.current.editing).toBe(false);
    expect(result.current.tempValue).toBe('hello');
  });

  it('startEdit sets editing=true', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    expect(result.current.editing).toBe(true);
  });

  it('handleChange updates tempValue mid-edit', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('world'));
    expect(result.current.tempValue).toBe('world');
  });

  it('cancelEdit restores currentValue and closes', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('partial'));
    act(() => result.current.cancelEdit());
    expect(result.current.editing).toBe(false);
    expect(result.current.tempValue).toBe('hello');
  });

  it('commitEdit calls onCommit when value is dirty and non-empty', async () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('world'));
    await act(async () => {
      await result.current.commitEdit();
    });
    expect(onCommit).toHaveBeenCalledWith('world');
    expect(result.current.editing).toBe(false);
  });

  it('commitEdit trims before calling onCommit', async () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('  world  '));
    await act(async () => {
      await result.current.commitEdit();
    });
    expect(onCommit).toHaveBeenCalledWith('world');
  });

  it('commitEdit skips onCommit when value unchanged', async () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    await act(async () => {
      await result.current.commitEdit();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  it('commitEdit skips onCommit when trimmed value is empty', async () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('   '));
    await act(async () => {
      await result.current.commitEdit();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  it('commitEdit resets to currentValue and closes when onCommit throws', async () => {
    onCommit.mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('world'));
    await act(async () => {
      await result.current.commitEdit();
    });
    expect(result.current.editing).toBe(false);
    expect(result.current.tempValue).toBe('hello');
  });

  it('double startEdit is idempotent', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.startEdit());
    expect(result.current.editing).toBe(true);
    expect(result.current.tempValue).toBe('hello');
  });

  it('tempValue syncs when currentValue changes while not editing', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: string }) => useInlineFieldEdit(val, onCommit),
      { initialProps: { val: 'hello' } }
    );
    rerender({ val: 'updated' });
    expect(result.current.tempValue).toBe('updated');
  });

  it('tempValue does NOT sync when currentValue changes while editing', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: string }) => useInlineFieldEdit(val, onCommit),
      { initialProps: { val: 'hello' } }
    );
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('in progress'));
    rerender({ val: 'server update' });
    expect(result.current.tempValue).toBe('in progress');
  });

  it('onKeyDown Enter triggers commitEdit', async () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('world'));
    await act(async () => {
      result.current.onKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>);
      await Promise.resolve();
    });
    expect(onCommit).toHaveBeenCalledWith('world');
  });

  it('onKeyDown Escape triggers cancelEdit', () => {
    const { result } = renderHook(() => useInlineFieldEdit('hello', onCommit));
    act(() => result.current.startEdit());
    act(() => result.current.handleChange('partial'));
    act(() => {
      result.current.onKeyDown({
        key: 'Escape',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(result.current.editing).toBe(false);
    expect(result.current.tempValue).toBe('hello');
  });
});

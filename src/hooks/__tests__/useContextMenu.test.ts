import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextMenu } from '../useContextMenu';

vi.mock('../../utils/toast', () => ({
  default: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// The menu itself (position, focus, arrow keys, Escape/Tab, outside click) is the kit's
// ContextMenu, tested in @lhak/style; `EntryContextMenu` wires it up. This hook decides which
// entry the menu is for and runs the two-step delete.

const entry = { source: '龙', translation: 'rồng', dictionaryId: 'phrases' };

function makeActions(overrides = {}) {
  return {
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A right click on the row: the row's handler, then the kit trigger asking to open. */
function rightClickRow(result: { current: ReturnType<typeof useContextMenu> }) {
  act(() => result.current.handleContextMenu('龙', 'rồng', 'phrases'));
  act(() => result.current.menu.onOpenChange(true));
}

describe('useContextMenu — open / close', () => {
  it('starts closed, with no entry', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    expect(result.current.menu.open).toBe(false);
    expect(result.current.menu.row).toBeNull();
  });

  it('a right click on a row opens the menu for that entry', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    rightClickRow(result);
    expect(result.current.menu.open).toBe(true);
    expect(result.current.menu.row).toEqual(entry);
  });

  it('a new right click disarms a delete armed on the last one', async () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    rightClickRow(result);
    await act(async () => result.current.handleContextMenuDelete());
    expect(result.current.confirmingDelete).toBe(true);
    rightClickRow(result);
    expect(result.current.confirmingDelete).toBe(false);
  });
});

describe('useContextMenu — action handlers', () => {
  let actions: ReturnType<typeof makeActions>;
  beforeEach(() => {
    actions = makeActions();
  });

  it('handleContextMenuEdit calls onEdit with the entry', () => {
    const { result } = renderHook(() => useContextMenu(actions));
    rightClickRow(result);
    act(() => result.current.handleContextMenuEdit());
    expect(actions.onEdit).toHaveBeenCalledWith(entry);
  });

  it('handleContextMenuMove calls onMove with the entry', () => {
    const { result } = renderHook(() => useContextMenu(actions));
    rightClickRow(result);
    act(() => result.current.handleContextMenuMove());
    expect(actions.onMove).toHaveBeenCalledWith(entry);
  });

  it('handleContextMenuDelete arms on the first click without deleting or closing', async () => {
    const { result } = renderHook(() => useContextMenu(actions));
    rightClickRow(result);
    await act(async () => result.current.handleContextMenuDelete());
    expect(actions.onDelete).not.toHaveBeenCalled();
    expect(result.current.confirmingDelete).toBe(true);
    expect(result.current.menu.open).toBe(true);
  });

  it('handleContextMenuDelete calls onDelete on the second click and closes', async () => {
    const { result } = renderHook(() => useContextMenu(actions));
    rightClickRow(result);
    await act(async () => result.current.handleContextMenuDelete());
    await act(async () => result.current.handleContextMenuDelete());
    expect(actions.onDelete).toHaveBeenCalledWith(entry);
    expect(result.current.menu.open).toBe(false);
  });

  it('handleContextMenuDelete closes and shows a toast when onDelete throws', async () => {
    const { default: toast } = await import('../../utils/toast');
    actions = makeActions({ onDelete: vi.fn().mockRejectedValue(new Error('save failed')) });
    const { result } = renderHook(() => useContextMenu(actions));
    rightClickRow(result);
    await act(async () => result.current.handleContextMenuDelete());
    await act(async () => result.current.handleContextMenuDelete());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('save failed'), {
      duration: 6000,
    });
    expect(result.current.menu.open).toBe(false);
  });
});

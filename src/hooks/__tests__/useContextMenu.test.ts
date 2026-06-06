import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextMenu } from '../useContextMenu';

vi.mock('../../components/ToastContext', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const entry = { source: '龙', translation: 'rồng' };

function makeActions(overrides = {}) {
  return {
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMouseEvent(x = 100, y = 200) {
  return {
    preventDefault: vi.fn(),
    clientX: x,
    clientY: y,
  } as unknown as React.MouseEvent;
}

describe('useContextMenu — open / close', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    expect(result.current.contextMenu.visible).toBe(false);
    expect(result.current.contextMenu.entry).toBeNull();
  });

  it('handleContextMenu opens with correct position and entry', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    act(() => result.current.handleContextMenu(makeMouseEvent(50, 80), '龙', 'rồng'));
    expect(result.current.contextMenu.visible).toBe(true);
    expect(result.current.contextMenu.x).toBe(50);
    expect(result.current.contextMenu.y).toBe(80);
    expect(result.current.contextMenu.entry).toEqual(entry);
  });

  it('closeContextMenu resets to closed state', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    act(() => result.current.closeContextMenu());
    expect(result.current.contextMenu.visible).toBe(false);
    expect(result.current.contextMenu.entry).toBeNull();
  });
});

describe('useContextMenu — action handlers', () => {
  it('handleContextMenuEdit calls onEdit with entry and closes', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useContextMenu(actions));
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    act(() => result.current.handleContextMenuEdit());
    expect(actions.onEdit).toHaveBeenCalledWith(entry);
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('handleContextMenuEdit no-ops when menu is closed', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useContextMenu(actions));
    act(() => result.current.handleContextMenuEdit());
    expect(actions.onEdit).not.toHaveBeenCalled();
  });

  it('handleContextMenuMove calls onMove with entry and closes', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useContextMenu(actions));
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    act(() => result.current.handleContextMenuMove());
    expect(actions.onMove).toHaveBeenCalledWith(entry);
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('handleContextMenuDelete calls onDelete with source and closes', async () => {
    const actions = makeActions();
    const { result } = renderHook(() => useContextMenu(actions));
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    await act(async () => result.current.handleContextMenuDelete());
    expect(actions.onDelete).toHaveBeenCalledWith('龙');
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('handleContextMenuDelete closes and shows toast when onDelete throws', async () => {
    const { toast } = await import('../../components/ToastContext');
    const actions = makeActions({ onDelete: vi.fn().mockRejectedValue(new Error('save failed')) });
    const { result } = renderHook(() => useContextMenu(actions));
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    await act(async () => result.current.handleContextMenuDelete());
    expect(result.current.contextMenu.visible).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('save failed'), 6000);
  });
});

describe('useContextMenu — keyboard navigation', () => {
  function makeKeyEvent(key: string) {
    return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>;
  }

  function attachMenuRef(result: { current: ReturnType<typeof useContextMenu> }) {
    const menu = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.setAttribute('role', 'menuitem');
    const btn2 = document.createElement('button');
    btn2.setAttribute('role', 'menuitem');
    menu.appendChild(btn1);
    menu.appendChild(btn2);
    document.body.appendChild(menu);
    // Refs are plain objects — set current directly
    (result.current.contextMenuRef as { current: HTMLDivElement }).current = menu;
    return { menu, btn1, btn2 };
  }

  it('Escape closes the menu', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    attachMenuRef(result);
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    act(() => result.current.handleContextMenuKeyDown(makeKeyEvent('Escape')));
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('Tab closes the menu', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    attachMenuRef(result);
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    act(() => result.current.handleContextMenuKeyDown(makeKeyEvent('Tab')));
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('Escape calls preventDefault', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    attachMenuRef(result);
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    const e = makeKeyEvent('Escape');
    act(() => result.current.handleContextMenuKeyDown(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ArrowDown moves focus to next item (wraps around)', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    const { btn1, btn2 } = attachMenuRef(result);
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    btn2.focus(); // start at last item
    act(() => result.current.handleContextMenuKeyDown(makeKeyEvent('ArrowDown')));
    expect(document.activeElement).toBe(btn1); // wraps to first
  });

  it('ArrowUp moves focus to previous item (wraps around)', () => {
    const { result } = renderHook(() => useContextMenu(makeActions()));
    const { btn1, btn2 } = attachMenuRef(result);
    act(() => result.current.handleContextMenu(makeMouseEvent(), '龙', 'rồng'));
    btn1.focus(); // start at first item
    act(() => result.current.handleContextMenuKeyDown(makeKeyEvent('ArrowUp')));
    expect(document.activeElement).toBe(btn2); // wraps to last
  });
});

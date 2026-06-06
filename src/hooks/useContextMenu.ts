import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '../components/ToastContext';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: { source: string; translation: string } | null;
}

interface UseContextMenuActions {
  onEdit: (entry: { source: string; translation: string }) => void;
  onMove: (entry: { source: string; translation: string }) => void;
  onDelete: (source: string) => Promise<void>;
}

const CLOSED: ContextMenuState = { visible: false, x: 0, y: 0, entry: null };

export function useContextMenu({ onEdit, onMove, onDelete }: UseContextMenuActions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(CLOSED);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const closeContextMenu = useCallback((): void => {
    setContextMenu(CLOSED);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, source: string, translation: string): void => {
      e.preventDefault();
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, entry: { source, translation } });
    },
    []
  );

  const handleContextMenuEdit = useCallback((): void => {
    if (!contextMenu.entry) return;
    onEdit(contextMenu.entry);
    closeContextMenu();
  }, [contextMenu.entry, onEdit, closeContextMenu]);

  const handleContextMenuMove = useCallback((): void => {
    if (!contextMenu.entry) return;
    onMove(contextMenu.entry);
    closeContextMenu();
  }, [contextMenu.entry, onMove, closeContextMenu]);

  const handleContextMenuDelete = useCallback(async (): Promise<void> => {
    if (!contextMenu.entry) return;
    const { source } = contextMenu.entry;
    try {
      await onDelete(source);
      closeContextMenu();
    } catch (error) {
      toast.error(`Failed to delete entry: ${(error as Error).message}`, 6000);
      closeContextMenu();
    }
  }, [contextMenu.entry, onDelete, closeContextMenu]);

  // Close when clicking outside
  useEffect(() => {
    if (!contextMenu.visible) return undefined;
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, closeContextMenu]);

  // Auto-focus first menu item when menu opens
  useEffect(() => {
    if (contextMenu.visible && contextMenuRef.current) {
      const firstButton =
        contextMenuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstButton?.focus();
    }
  }, [contextMenu.visible]);

  const handleContextMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!contextMenuRef.current) return;
      const items = Array.from(
        contextMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      );
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(currentIndex + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closeContextMenu();
      }
    },
    [closeContextMenu]
  );

  return {
    contextMenu,
    contextMenuRef,
    closeContextMenu,
    handleContextMenu,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
    handleContextMenuKeyDown,
  };
}

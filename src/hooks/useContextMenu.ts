import { useState, useRef, useEffect, useCallback } from 'react';
import toast from '../utils/toast';

/** The entry a context menu acts on. `dictionaryId` travels with it because the duplicate
 * view mixes rows from many dictionaries — the table's selected dictionary is not the owner. */
export interface ContextMenuEntry {
  source: string;
  translation: string;
  dictionaryId: string;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: ContextMenuEntry | null;
}

interface UseContextMenuActions {
  onEdit: (entry: ContextMenuEntry) => void;
  onMove: (entry: ContextMenuEntry) => void;
  onDelete: (entry: ContextMenuEntry) => Promise<void>;
}

const CLOSED: ContextMenuState = { visible: false, x: 0, y: 0, entry: null };

export function useContextMenu({ onEdit, onMove, onDelete }: UseContextMenuActions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(CLOSED);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Delete is two-step: the first click arms it (the item turns into a "click again" prompt),
  // the second deletes. Bulk delete already asked for confirmation; this one didn't.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const closeContextMenu = useCallback((): void => {
    setContextMenu(CLOSED);
    setConfirmingDelete(false);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, source: string, translation: string, dictionaryId: string): void => {
      e.preventDefault();
      setConfirmingDelete(false);
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        entry: { source, translation, dictionaryId },
      });
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
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await onDelete(contextMenu.entry);
      closeContextMenu();
    } catch (error) {
      toast.error(`Failed to delete entry: ${(error as Error).message}`, { duration: 6000 });
      closeContextMenu();
    }
  }, [contextMenu.entry, confirmingDelete, onDelete, closeContextMenu]);

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
    confirmingDelete,
    closeContextMenu,
    handleContextMenu,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
    handleContextMenuKeyDown,
  };
}

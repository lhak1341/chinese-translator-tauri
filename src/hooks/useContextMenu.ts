import { useState, useCallback } from 'react';
import { useRowMenu, type RowMenu } from '@lhak/style/react';
import toast from '../utils/toast';

/** The entry a context menu acts on. `dictionaryId` travels with it because the duplicate
 * view mixes rows from many dictionaries — the table's selected dictionary is not the owner. */
export interface ContextMenuEntry {
  source: string;
  translation: string;
  dictionaryId: string;
}

/** A row's `onContextMenu`: names the entry the menu opens on. The kit trigger around the
 * rows opens the menu and stops the WebView's own, so the row needs no event. */
export type OpenEntryMenu = (source: string, translation: string, dictionaryId: string) => void;

interface UseContextMenuActions {
  onEdit: (entry: ContextMenuEntry) => void;
  onMove: (entry: ContextMenuEntry) => void;
  onDelete: (entry: ContextMenuEntry) => Promise<void>;
}

/**
 * The entry actions menu (Edit / Move to... / Delete) for a table of entries: one kit context
 * menu for the whole table (`useRowMenu`, @lhak/style kit issue 15), opened on whichever row
 * was right-clicked. `EntryContextMenu` renders it around the table's rows. Base UI owns the
 * position, focus, arrow keys, Escape/Tab and the outside click; this hook owns which entry
 * the menu is for and the two-step delete.
 */
export function useContextMenu({ onEdit, onMove, onDelete }: UseContextMenuActions) {
  const menu: RowMenu<ContextMenuEntry> = useRowMenu<ContextMenuEntry>();
  const { openOn, close } = menu;
  // Delete is two-step: the first click arms it (the item turns into a "click again" prompt),
  // the second deletes. Bulk delete already asked for confirmation; this one didn't.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleContextMenu: OpenEntryMenu = useCallback(
    (source, translation, dictionaryId) => {
      setConfirmingDelete(false);
      openOn({ source, translation, dictionaryId });
    },
    [openOn]
  );

  const handleContextMenuEdit = useCallback((): void => {
    if (menu.row) onEdit(menu.row);
  }, [menu.row, onEdit]);

  const handleContextMenuMove = useCallback((): void => {
    if (menu.row) onMove(menu.row);
  }, [menu.row, onMove]);

  /** The Delete item keeps the menu open (`closeOnClick={false}`): the first click arms it,
   * the second deletes and closes. */
  const handleContextMenuDelete = useCallback(async (): Promise<void> => {
    const entry = menu.row;
    if (!entry) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await onDelete(entry);
    } catch (error) {
      toast.error(`Failed to delete entry: ${(error as Error).message}`, { duration: 6000 });
    }
    close();
  }, [menu.row, confirmingDelete, onDelete, close]);

  return {
    menu,
    confirmingDelete,
    handleContextMenu,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
  };
}

import React from 'react';
import { Edit2, Trash2, ArrowRightLeft } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuPopup,
  ContextMenuTrigger,
  MenuItem,
  MenuSeparator,
} from '@lhak/style/react';
import { getMoveFamily } from '../../utils/dictionary';
import type { useContextMenu } from '../../hooks/useContextMenu';

interface EntryContextMenuProps {
  /** The whole `useContextMenu` result — this component is its only renderer. */
  menu: ReturnType<typeof useContextMenu>;
  /** The element that holds the rows (the table body, often the scroll container): a right
   * click on a row in it opens the menu. Its own props and ref are kept. */
  body: React.ReactElement;
  /** The rows, unless `body` renders its own (`VirtualTableBody`). */
  children?: React.ReactNode;
  /** Hide "Edit Entry" where the view already edits inline and has no edit modal
   * (the Rules tab's Matches view). */
  showEdit?: boolean;
}

/** Right-click menu for one dictionary entry: Edit / Move to... / Delete (two-click). Shared by
 * the Dictionary tab (normal and duplicate views) and the Rules tab's Matches view, so every
 * place that lists entries offers the same actions with the same rules — Move is disabled for
 * entries in string-only lookup tables (`getMoveFamily`), Delete needs a confirming click.
 * One kit context menu wraps the table body (@lhak/style `useRowMenu`, kit issue 15), so a
 * virtualised table mounts one menu, not one per row. */
const EntryContextMenu: React.FC<EntryContextMenuProps> = ({
  menu,
  body,
  children,
  showEdit = true,
}) => {
  const {
    menu: rowMenu,
    confirmingDelete,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
  } = menu;

  const entry = rowMenu.row;
  const canMove = entry !== null && getMoveFamily(entry.dictionaryId) !== null;

  return (
    <ContextMenu open={rowMenu.open} onOpenChange={rowMenu.onOpenChange}>
      <ContextMenuTrigger render={body}>{children}</ContextMenuTrigger>
      <ContextMenuPopup aria-label="Entry actions">
        {showEdit && (
          <MenuItem icon={Edit2} onClick={handleContextMenuEdit}>
            Edit Entry
          </MenuItem>
        )}
        <MenuItem
          icon={ArrowRightLeft}
          onClick={handleContextMenuMove}
          disabled={!canMove}
          title={
            canMove
              ? undefined
              : 'Entries in this lookup table cannot be moved to another dictionary'
          }
        >
          Move to...
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={Trash2}
          variant="danger"
          closeOnClick={false}
          onClick={() => void handleContextMenuDelete()}
        >
          {confirmingDelete ? 'Click again to delete' : 'Delete Entry'}
        </MenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
};

export default EntryContextMenu;

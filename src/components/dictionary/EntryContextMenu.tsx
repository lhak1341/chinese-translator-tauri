import React from 'react';
import { Edit2, Trash2, ArrowRightLeft } from 'lucide-react';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { getMoveFamily } from '../../utils/dictionary';
import type { useContextMenu } from '../../hooks/useContextMenu';

interface EntryContextMenuProps {
  /** The whole `useContextMenu` result — this component is its only renderer. */
  menu: ReturnType<typeof useContextMenu>;
  /** Hide "Edit Entry" where the view already edits inline and has no edit modal
   * (the Rules tab's Matches view). */
  showEdit?: boolean;
}

/** Right-click menu for one dictionary entry: Edit / Move to... / Delete (two-click). Shared by
 * the Dictionary tab (normal and duplicate views) and the Rules tab's Matches view, so every
 * place that lists entries offers the same actions with the same rules — Move is disabled for
 * entries in string-only lookup tables (`getMoveFamily`), Delete needs a confirming click. */
const EntryContextMenu: React.FC<EntryContextMenuProps> = ({ menu, showEdit = true }) => {
  const {
    contextMenu,
    contextMenuRef,
    confirmingDelete,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
    handleContextMenuKeyDown,
  } = menu;

  if (!contextMenu.visible || !contextMenu.entry) return null;

  const canMove = getMoveFamily(contextMenu.entry.dictionaryId) !== null;

  return (
    <div
      ref={contextMenuRef}
      role="menu"
      aria-label="Entry actions"
      style={{
        position: 'fixed',
        top: contextMenu.y,
        left: contextMenu.x,
        backgroundColor: 'var(--background-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 2000,
        minWidth: '180px',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleContextMenuKeyDown}
    >
      {showEdit && (
        <button role="menuitem" onClick={handleContextMenuEdit} className={styles.contextMenuItem}>
          <Edit2 size={14} />
          <span>Edit Entry</span>
        </button>
      )}

      <button
        role="menuitem"
        onClick={handleContextMenuMove}
        className={styles.contextMenuItem}
        disabled={!canMove}
        aria-disabled={!canMove}
        title={
          canMove ? undefined : 'Entries in this lookup table cannot be moved to another dictionary'
        }
        style={canMove ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
      >
        <ArrowRightLeft size={14} />
        <span>Move to...</span>
      </button>

      <div
        style={{
          height: '1px',
          backgroundColor: 'var(--border-color)',
          margin: '0.25rem 0',
        }}
      />

      <button
        role="menuitem"
        onClick={handleContextMenuDelete}
        className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
      >
        <Trash2 size={14} />
        <span>{confirmingDelete ? 'Click again to delete' : 'Delete Entry'}</span>
      </button>
    </div>
  );
};

export default EntryContextMenu;

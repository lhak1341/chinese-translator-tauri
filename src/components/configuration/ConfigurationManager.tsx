import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PlusCircle,
  Loader,
  AlertCircle,
  Pencil,
  Check,
  X,
  Bookmark,
  CircleArrowUp,
  CircleArrowDown,
} from 'lucide-react';
import {
  bareNameOf,
  tierOf,
  isFictionProperNounsId,
  otherPairedTierId,
} from '../../utils/dictionary/DictionaryIdClassifier';
import { configurationDictionaryName } from '../../utils/dictionary/DictionaryLabels';
import styles from '../../styles/ConfigurationManager.module.css';
import menuStyles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { useDictionaryConfigManagement } from './useDictionaryConfigManagement';

interface TierMenuProps {
  dictionaryId: string;
  x: number;
  y: number;
  /** Every dictionary id listed, to refuse a move onto a name the other tier already has. */
  existingIds: readonly string[];
  onMove: (dictionaryId: string) => void;
  onClose: () => void;
}

/** Right-click menu for a fiction or generic row: promote to generic, or demote to fiction.
 * Either moves the pair — proper nouns and its patterns half — under the same name. */
const TierMenu: React.FC<TierMenuProps> = ({
  dictionaryId,
  x,
  y,
  existingIds,
  onMove,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetId = otherPairedTierId(dictionaryId);
  const promoting = isFictionProperNounsId(dictionaryId);
  const taken = targetId !== null && existingIds.includes(targetId);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    document.addEventListener('click', onClose);
    return () => document.removeEventListener('click', onClose);
  }, [onClose]);

  if (!targetId) return null;
  const targetName = bareNameOf(targetId);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Dictionary actions"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: 'var(--background-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 2000,
        minWidth: '180px',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <button
        role="menuitem"
        tabIndex={0}
        className={menuStyles.contextMenuItem}
        disabled={taken}
        aria-disabled={taken}
        style={taken ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        title={
          taken
            ? `${targetName} already exists`
            : promoting
              ? `Move to Generic as ${targetName}, with its patterns. Books bound to it are unbound; every book reads it.`
              : `Move to Fiction as ${targetName}, with its patterns. Books can then bind to it.`
        }
        onClick={() => {
          onClose();
          onMove(dictionaryId);
        }}
      >
        {promoting ? <CircleArrowUp size={14} /> : <CircleArrowDown size={14} />}
        <span>{promoting ? 'Promote to Generic' : 'Demote to Fiction'}</span>
      </button>
    </div>
  );
};

/**
 * ConfigurationManager Component
 *
 * Manages application configuration including:
 * - WebAssembly acceleration settings
 * - Active proper nouns dictionaries
 * - Creating new custom dictionaries
 *
 * @returns Configuration management interface
 */
const ConfigurationManager: React.FC = () => {
  const {
    activeDictionaries,
    isLoading,
    error,
    showNewDictionaryModal,
    openCreateModal,
    closeCreateModal,
    newDictionaryName,
    updateDraftName,
    renamingDictionaryId,
    renameValue,
    updateRenameValue,
    defaultQuickAddDictionary,
    isDefaultLockedByBook,
    categorizedDictionaries,
    handleToggleDictionary,
    handleCreateDictionary,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    handleSetDefaultQuickAdd,
    isFictionLockedByBook,
    isRowLocked,
    openBookTitle,
    availableDictionaries,
    handleMoveTier,
  } = useDictionaryConfigManagement();

  const [tierMenu, setTierMenu] = useState<{ dictionaryId: string; x: number; y: number } | null>(
    null
  );
  const closeTierMenu = useCallback(() => setTierMenu(null), []);

  // Render a single dictionary row (minimal style, no card borders)
  const renderDictionaryRow = (dictionaryId: string) => {
    const isChecked = activeDictionaries.includes(dictionaryId);
    const isRenaming = renamingDictionaryId === dictionaryId;
    const canRename = dictionaryId !== 'properNouns';
    const isDefaultQuickAdd = defaultQuickAddDictionary === dictionaryId;
    const isNonRootProperNoun = tierOf(dictionaryId) !== 'root';
    // A fiction row reflects the open book's binding while one is open; it stays visible
    // and readable, it just isn't the place to change it. Generic and theme rows are
    // untouched by this.
    const isLocked = isRowLocked(dictionaryId);

    return (
      <div
        key={dictionaryId}
        className={styles.dictionaryRow}
        onContextMenu={
          otherPairedTierId(dictionaryId) && !isRenaming
            ? (e) => {
                e.preventDefault();
                setTierMenu({ dictionaryId, x: e.clientX, y: e.clientY });
              }
            : undefined
        }
      >
        {isRenaming ? (
          // Rename mode
          <div className={styles.renameContainer}>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => updateRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
              autoFocus
              className={styles.renameInput}
            />
            <button
              onClick={handleConfirmRename}
              className={styles.confirmButton}
              title="Confirm rename"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelRename}
              className={styles.cancelButton}
              title="Cancel rename"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          // Normal mode
          <>
            <label
              className={`${styles.dictionaryLabel} ${isChecked ? styles.dictionaryLabelActive : styles.dictionaryLabelInactive}`}
              style={{
                color: isChecked ? 'var(--primary-color)' : 'var(--text-color)',
                fontWeight: isChecked ? 500 : 'normal',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isLocked}
                onChange={() => handleToggleDictionary(dictionaryId)}
                title={
                  isLocked
                    ? `Set by the book open in the Reader${openBookTitle ? `: ${openBookTitle}` : ''}`
                    : undefined
                }
              />
              {configurationDictionaryName(dictionaryId)}
            </label>
            {/* Bookmark icon for setting Cmd-5 default (only for active custom proper noun dictionaries) */}
            {isChecked && isNonRootProperNoun && (
              <button
                onClick={() => handleSetDefaultQuickAdd(dictionaryId)}
                disabled={isDefaultLockedByBook}
                className={`${styles.bookmarkButton} ${isDefaultQuickAdd ? styles.bookmarkButtonDefault : styles.bookmarkButtonInactive}`}
                title={
                  isDefaultLockedByBook
                    ? `Cmd-5 follows the open book${openBookTitle ? `: ${openBookTitle}` : ''}`
                    : isDefaultQuickAdd
                      ? 'Default Cmd-5 dictionary (click to unset)'
                      : 'Set as default Cmd-5 dictionary'
                }
              >
                <Bookmark size={14} fill={isDefaultQuickAdd ? 'var(--error-color)' : 'none'} />
              </button>
            )}
            {canRename && (
              <button
                onClick={() => handleStartRename(dictionaryId)}
                className={styles.renameButton}
                title="Rename dictionary"
              >
                <Pencil size={14} />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader size={20} className={`animate-spin ${styles.loadingSpinner}`} />
        <span className={styles.loadingText}>Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Dictionaries Section */}
      <div className={styles.dictionariesSection}>
        <div className={styles.dictionariesHeader}>
          <div className={styles.headerLeft}>
            <h2 className={styles.dictionariesTitle}>Proper Nouns Dictionaries</h2>
            <span className={styles.dictionariesCount}>
              {activeDictionaries.length} active
              {defaultQuickAddDictionary && (
                <>
                  {' • Add defaults to '}
                  <span className={styles.quickAddDefault}>
                    {configurationDictionaryName(defaultQuickAddDictionary)}
                  </span>
                </>
              )}
            </span>
          </div>
          <button onClick={openCreateModal} className={`primary ${styles.newButton}`}>
            <PlusCircle size={14} />
            New
          </button>
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* 2-Column Layout: Left 25% (Base + Generic stacked) | Right 75% (Fiction in 3 cols) */}
        <div className={styles.layoutContainer}>
          {/* Left Column: Base + Generic stacked (25% width) */}
          <div className={styles.leftColumn}>
            {/* Base Section */}
            <div className={styles.categorySection}>
              <div className={styles.categoryHeader}>Base</div>
              <div className={styles.dictionaryList}>
                {categorizedDictionaries.base.map((dictionaryId) =>
                  renderDictionaryRow(dictionaryId)
                )}
                {categorizedDictionaries.base.length === 0 && (
                  <div className={styles.noDictionaries}>No dictionaries</div>
                )}
              </div>
            </div>

            {/* Generic Section */}
            <div>
              <div className={styles.categoryHeader}>Generic</div>
              <div className={styles.dictionaryList}>
                {categorizedDictionaries.generic.map((dictionaryId) =>
                  renderDictionaryRow(dictionaryId)
                )}
                {categorizedDictionaries.generic.length === 0 && (
                  <div className={styles.noDictionaries}>No dictionaries</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Fiction in 3 columns (75% width, column-first ordering) */}
          <div className={styles.rightColumn}>
            <div className={styles.categoryHeader}>
              Fiction
              {isFictionLockedByBook && (
                <span className={styles.categoryNote}>
                  {openBookTitle ? `set by ${openBookTitle}` : 'set by the open book'}
                </span>
              )}
            </div>
            {categorizedDictionaries.fiction.length === 0 ? (
              <div className={styles.noDictionaries}>No dictionaries</div>
            ) : (
              <div className={styles.fictionColumns}>
                {/* Split fiction into 3 columns for A-Z column-first ordering */}
                {(() => {
                  const fiction = categorizedDictionaries.fiction;
                  const itemsPerColumn = Math.ceil(fiction.length / 3);
                  const col1 = fiction.slice(0, itemsPerColumn);
                  const col2 = fiction.slice(itemsPerColumn, itemsPerColumn * 2);
                  const col3 = fiction.slice(itemsPerColumn * 2);

                  return (
                    <>
                      <div className={styles.fictionColumn}>
                        {col1.map((dictionaryId) => renderDictionaryRow(dictionaryId))}
                      </div>
                      <div className={styles.fictionColumn}>
                        {col2.map((dictionaryId) => renderDictionaryRow(dictionaryId))}
                      </div>
                      <div className={styles.fictionColumn}>
                        {col3.map((dictionaryId) => renderDictionaryRow(dictionaryId))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {tierMenu && (
        <TierMenu
          {...tierMenu}
          existingIds={availableDictionaries}
          onMove={handleMoveTier}
          onClose={closeTierMenu}
        />
      )}

      {showNewDictionaryModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContainer}>
            <h3 className={styles.modalHeading}>Create New Dictionary</h3>
            <form onSubmit={handleCreateDictionary}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Dictionary Name</label>
                <input
                  type="text"
                  value={newDictionaryName}
                  onChange={(e) => updateDraftName(e.target.value)}
                  placeholder="e.g., HarryPotter, JourneyToTheWest"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.buttonContainer}>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className={styles.modalCancelButton}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`primary ${styles.modalSubmitButton}`}
                  disabled={!newDictionaryName.trim()}
                  style={{
                    cursor: newDictionaryName.trim() ? 'pointer' : 'not-allowed',
                    opacity: newDictionaryName.trim() ? 1 : 0.6,
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationManager;

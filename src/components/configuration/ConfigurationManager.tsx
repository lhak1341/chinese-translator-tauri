import React from 'react';
import { PlusCircle, Loader, AlertCircle, Pencil, Check, X, Bookmark } from 'lucide-react';
import { isFictionProperNounsId } from '../../utils/dictionary/DictionaryIdClassifier';
import styles from '../../styles/ConfigurationManager.module.css';
import { useDictionaryConfigManagement } from './useDictionaryConfigManagement';

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
    categorizedDictionaries,
    handleToggleDictionary,
    handleCreateDictionary,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    handleSetDefaultQuickAdd,
    isFictionLockedByBook,
    openBookTitle,
  } = useDictionaryConfigManagement();

  // Render a single dictionary row (minimal style, no card borders)
  const renderDictionaryRow = (dictionaryId: string) => {
    const isChecked = activeDictionaries.includes(dictionaryId);
    const isRenaming = renamingDictionaryId === dictionaryId;
    const canRename = dictionaryId !== 'properNouns';
    const isDefaultQuickAdd = defaultQuickAddDictionary === dictionaryId;
    const isCustomProperNoun = dictionaryId.startsWith('properNouns-');
    // A fiction row reflects the open book's binding while one is open; it stays visible
    // and readable, it just isn't the place to change it. Generic and theme rows are
    // untouched by this.
    const isLocked = isFictionLockedByBook && isFictionProperNounsId(dictionaryId);

    // Get display name
    const getDisplayName = (id: string): string => {
      if (id === 'properNouns') return 'General Purpose Dictionary';
      return id.replace('properNouns-', '');
    };

    return (
      <div key={dictionaryId} className={styles.dictionaryRow}>
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
              {getDisplayName(dictionaryId)}
            </label>
            {/* Bookmark icon for setting Cmd-5 default (only for active custom proper noun dictionaries) */}
            {isChecked && isCustomProperNoun && (
              <button
                onClick={() => handleSetDefaultQuickAdd(dictionaryId)}
                className={`${styles.bookmarkButton} ${isDefaultQuickAdd ? styles.bookmarkButtonDefault : styles.bookmarkButtonInactive}`}
                title={
                  isDefaultQuickAdd
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
                    {defaultQuickAddDictionary.replace('properNouns-', '')}
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

import React, { useState, useEffect, useMemo } from 'react';
import { formatErrorMessage } from '../../utils/errorHelpers';
import { loadAppConfig, saveAppConfig } from '../../utils/appConfig';
import { toPatternsId } from '../../utils/dictionary';
import { PlusCircle, Loader, AlertCircle, Pencil, Check, X, Bookmark } from 'lucide-react';
import styles from '../../styles/ConfigurationManager.module.css';

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
  const [availableDictionaries, setAvailableDictionaries] = useState<string[]>([]);
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDictionaryModal, setShowNewDictionaryModal] = useState<boolean>(false);
  const [newDictionaryName, setNewDictionaryName] = useState<string>('');

  // Rename state
  const [renamingDictionaryId, setRenamingDictionaryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Default Cmd-5 dictionary state
  const [defaultQuickAddDictionary, setDefaultQuickAddDictionary] = useState<string | null>(null);

  // Sort dictionaries: general 'properNouns' first, then custom ones alphabetically
  const sortDictionaries = (dictionaries: string[]): string[] => {
    return dictionaries.sort((a, b) => {
      // Always put 'properNouns' first
      if (a === 'properNouns') return -1;
      if (b === 'properNouns') return 1;
      // Sort custom dictionaries alphabetically
      return a.localeCompare(b);
    });
  };

  // Categorize dictionaries into Base, Generic (_), and Fiction (f_)
  const categorizeDictionaries = (
    dictionaries: string[]
  ): { base: string[]; generic: string[]; fiction: string[] } => {
    const base: string[] = [];
    const generic: string[] = [];
    const fiction: string[] = [];

    dictionaries.forEach((id) => {
      const name = id.replace('properNouns-', '');
      if (id === 'properNouns') {
        base.push(id);
      } else if (name.startsWith('f_')) {
        fiction.push(id);
      } else if (name.startsWith('_')) {
        generic.push(id);
      } else {
        base.push(id);
      }
    });

    return {
      base: base.sort((a, b) => a.localeCompare(b)),
      generic: generic.sort((a, b) => a.localeCompare(b)),
      fiction: fiction.sort((a, b) => a.localeCompare(b)),
    };
  };

  const categorizedDictionaries = useMemo(
    () => categorizeDictionaries(availableDictionaries),
    [availableDictionaries]
  );

  // Load available dictionaries on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const result = await window.electronAPI.listProperNounsDictionaries();
        if (result.success && result.dictionaries) {
          const dictionaryIds = result.dictionaries.map((d) => (typeof d === 'string' ? d : d.id));
          setAvailableDictionaries(sortDictionaries(dictionaryIds));

          // Load active dictionaries from saved configuration
          const config = await loadAppConfig();
          setActiveDictionaries(config.engine.activeProperNouns);
          setDefaultQuickAddDictionary(config.ui.defaultQuickAddDictionary);

          // Migration: create missing patterns-f_* for pre-existing fiction proper-noun dicts
          try {
            const patternsListResult = await window.electronAPI.listFictionPatternDictionaries();
            const existingPatterns = new Set<string>(
              patternsListResult.success
                ? (patternsListResult.dictionaries as unknown as string[])
                : []
            );
            const fictionDicts = dictionaryIds.filter((id) => id.startsWith('properNouns-f_'));
            for (const id of fictionDicts) {
              const patternsDictId = toPatternsId(id);
              if (!existingPatterns.has(patternsDictId)) {
                await window.electronAPI.createStructuralPatternsDictionary(patternsDictId);
              }
            }
          } catch (migrationErr) {
            console.warn('Fiction pattern dictionary migration failed (non-fatal):', migrationErr);
          }
        } else {
          throw new Error(result.error || 'Failed to load dictionaries');
        }
      } catch (err) {
        setError(formatErrorMessage('Dictionary loading', err));
      } finally {
        setIsLoading(false);
      }
    };

    loadDictionaries();
  }, []);

  // Handle dictionary activation toggle
  const handleToggleDictionary = async (dictionaryId: string): Promise<void> => {
    try {
      const newActiveDictionaries = activeDictionaries.includes(dictionaryId)
        ? activeDictionaries.filter((id) => id !== dictionaryId)
        : [...activeDictionaries, dictionaryId];

      await saveAppConfig({ engine: { activeProperNouns: newActiveDictionaries } });
      setActiveDictionaries(newActiveDictionaries);
    } catch (err) {
      setError(formatErrorMessage('Configuration update', err));
    }
  };

  // Handle creating new dictionary
  const handleCreateDictionary = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newDictionaryName.trim()) return;

    try {
      const dictionaryId = `properNouns-${newDictionaryName.trim().replace(/\s+/g, '')}`;
      const result = await window.electronAPI.createProperNounsDictionary(dictionaryId);

      if (result.success) {
        // Eager creation: also create paired patterns dict for fiction dicts
        if (dictionaryId.startsWith('properNouns-f_')) {
          const patternsDictId = toPatternsId(dictionaryId);
          const patternsResult =
            await window.electronAPI.createStructuralPatternsDictionary(patternsDictId);
          if (!patternsResult.success) {
            console.warn(
              `Created ${dictionaryId} but failed to create paired ${patternsDictId}:`,
              patternsResult.error
            );
          }
        }

        setAvailableDictionaries(sortDictionaries([...availableDictionaries, dictionaryId]));
        setShowNewDictionaryModal(false);
        setNewDictionaryName('');
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(formatErrorMessage('Dictionary creation', err));
    }
  };

  // Handle rename dictionary
  const handleStartRename = (dictionaryId: string): void => {
    if (dictionaryId === 'properNouns') return; // Cannot rename default

    // Extract the name part (remove "properNouns-" prefix)
    const name = dictionaryId.replace('properNouns-', '');
    setRenamingDictionaryId(dictionaryId);
    setRenameValue(name);
  };

  const handleCancelRename = (): void => {
    setRenamingDictionaryId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (): Promise<void> => {
    if (!renamingDictionaryId || !renameValue.trim()) return;

    try {
      const newDictionaryId = `properNouns-${renameValue.trim().replace(/\s+/g, '')}`;

      // Don't rename if the name hasn't changed
      if (newDictionaryId === renamingDictionaryId) {
        handleCancelRename();
        return;
      }

      const result = await window.electronAPI.renameProperNounsDictionary(
        renamingDictionaryId,
        newDictionaryId
      );

      if (result.success) {
        // Update the available dictionaries list and re-sort
        setAvailableDictionaries((prev) =>
          sortDictionaries(prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id)))
        );

        // Update active dictionaries if the renamed one was active
        setActiveDictionaries((prev) =>
          prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id))
        );

        // Update default Cmd-5 dictionary if the renamed one was the default
        if (defaultQuickAddDictionary === renamingDictionaryId) {
          setDefaultQuickAddDictionary(newDictionaryId);
        }

        handleCancelRename();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(formatErrorMessage('Dictionary rename', err));
    }
  };

  // Handle setting default Cmd-5 dictionary
  const handleSetDefaultQuickAdd = async (dictionaryId: string): Promise<void> => {
    try {
      // If clicking the same dictionary, unset it (toggle off)
      const newDefault = defaultQuickAddDictionary === dictionaryId ? null : dictionaryId;

      await saveAppConfig({ ui: { defaultQuickAddDictionary: newDefault } });
      setDefaultQuickAddDictionary(newDefault);
    } catch (err) {
      setError(formatErrorMessage('Default dictionary configuration', err));
    }
  };

  // Render a single dictionary row (minimal style, no card borders)
  const renderDictionaryRow = (dictionaryId: string) => {
    const isChecked = activeDictionaries.includes(dictionaryId);
    const isRenaming = renamingDictionaryId === dictionaryId;
    const canRename = dictionaryId !== 'properNouns';
    const isDefaultQuickAdd = defaultQuickAddDictionary === dictionaryId;
    const isCustomProperNoun = dictionaryId.startsWith('properNouns-');

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
              onChange={(e) => setRenameValue(e.target.value)}
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
                onChange={() => handleToggleDictionary(dictionaryId)}
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
                  {' • Quick Add defaults to '}
                  <span className={styles.quickAddDefault}>
                    {defaultQuickAddDictionary.replace('properNouns-', '')}
                  </span>
                </>
              )}
            </span>
          </div>
          <button
            onClick={() => setShowNewDictionaryModal(true)}
            className={`primary ${styles.newButton}`}
          >
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
            <div className={styles.categoryHeader}>Fiction</div>
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
                  onChange={(e) => setNewDictionaryName(e.target.value)}
                  placeholder="e.g., HarryPotter, JourneyToTheWest"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.buttonContainer}>
                <button
                  type="button"
                  onClick={() => setShowNewDictionaryModal(false)}
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

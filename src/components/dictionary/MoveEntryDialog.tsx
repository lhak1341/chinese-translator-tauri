import React, { useState, useEffect, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes, DICTIONARY_TYPES } from './DictionaryTypes';
import { Loader, AlertTriangle, Info } from 'lucide-react';
import styles from '../../styles/MoveEntryDialog.module.css';
import { logger } from '../../utils/logger';
import toast from '../../utils/toast';

/**
 * Dictionary entry to be moved (basic structure from context menu)
 */
interface DictionaryEntry {
  source: string;
  translation: string;
}

/**
 * Full entry data with metadata extracted from dictionary
 */
interface FullEntryData {
  source: string;
  translation: string;
  metadata?: {
    allowAsPatternVariable?: boolean;
    lowPriority?: boolean;
  };
}

/**
 * Available dictionary option
 */
interface AvailableDictionary {
  id: string;
  label: string;
  type: string;
}

/**
 * Props for MoveEntryDialog component
 */
interface MoveEntryDialogProps {
  entry: DictionaryEntry;
  onClose: () => void;
  currentDictionary: string;
}

/**
 * MoveEntryDialog Component
 *
 * Enhanced modal dialog for moving dictionary entries between dictionaries.
 * Features:
 * - Entry context display (source + translation preview)
 * - Source dictionary name display
 * - Metadata preservation (allowAsPatternVariable, lowPriority)
 * - Existing entry detection and warning
 * - Dictionary type compatibility validation
 * - Atomic move operation with rollback on failure
 * - Cache invalidation after successful move
 * - Toast notifications for all outcomes
 *
 * @param props - Component props
 * @returns Enhanced modal dialog for moving entries
 */
const MoveEntryDialog: React.FC<MoveEntryDialogProps> = ({ entry, onClose, currentDictionary }) => {
  const [selectedDictionary, setSelectedDictionary] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [availableDictionaries, setAvailableDictionaries] = useState<AvailableDictionary[]>([]);
  const [fullEntry, setFullEntry] = useState<FullEntryData | null>(null);
  const [sourceDictionaryLabel, setSourceDictionaryLabel] = useState<string>('');

  const { addEntry, deleteEntry, dictionaries } = useDictionary();

  // Extract full entry data with metadata from current dictionary
  useEffect(() => {
    const extractFullEntry = (): void => {
      if (!dictionaries || !dictionaries[currentDictionary]) {
        setFullEntry({
          source: entry.source,
          translation: entry.translation,
        });
        return;
      }

      const dictionary = dictionaries[currentDictionary];
      const value = dictionary[entry.source];

      if (!value) {
        // Entry not found in dictionary (shouldn't happen, but handle gracefully)
        logger.warn('Entry not found in dictionary:', entry.source);
        setFullEntry({
          source: entry.source,
          translation: entry.translation,
        });
        return;
      }

      // Extract metadata if present
      if (typeof value === 'object') {
        setFullEntry({
          source: entry.source,
          translation: value.translation,
          metadata: {
            allowAsPatternVariable: value.allowAsPatternVariable || false,
            lowPriority: value.lowPriority || false,
          },
        });
        logger.log('Extracted entry with metadata:', {
          source: entry.source,
          metadata: {
            allowAsPatternVariable: value.allowAsPatternVariable,
            lowPriority: value.lowPriority,
          },
        });
      } else {
        setFullEntry({
          source: entry.source,
          translation: value,
        });
      }
    };

    extractFullEntry();
  }, [entry, currentDictionary, dictionaries]);

  // Load dictionaries and get readable names
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();

        // Get source dictionary label
        const sourceType = types[currentDictionary as keyof typeof types];
        if (sourceType) {
          setSourceDictionaryLabel(sourceType.label || currentDictionary);
        } else {
          // Fallback for proper nouns
          if (currentDictionary === 'properNouns') {
            setSourceDictionaryLabel('Proper Nouns (Base)');
          } else if (currentDictionary.startsWith('properNouns-')) {
            setSourceDictionaryLabel(
              `Proper Nouns - ${currentDictionary.replace('properNouns-', '')}`
            );
          } else {
            setSourceDictionaryLabel(
              currentDictionary.charAt(0).toUpperCase() + currentDictionary.slice(1)
            );
          }
        }

        // Build destination dictionary list (exclude current dictionary)
        const dictionaryList: AvailableDictionary[] = Object.keys(types)
          .filter((id) => id !== currentDictionary)
          .map((id) => {
            const type = types[id as keyof typeof types];
            let label = type.label || id;

            // ISSUE #7 FIX: Improve dictionary name labels
            if (id === 'properNouns') {
              label = 'Proper Nouns (Base)';
            } else if (id.startsWith('properNouns-')) {
              label = `Proper Nouns - ${id.replace('properNouns-', '')}`;
            }

            return {
              id,
              label,
              type: type.id || id,
            };
          })
          .sort((a, b) => {
            // Always put 'properNouns' first
            if (a.id === 'properNouns') return -1;
            if (b.id === 'properNouns') return 1;
            // Sort custom dictionaries alphabetically
            return a.id.localeCompare(b.id);
          });

        setAvailableDictionaries(dictionaryList);
      } catch (error) {
        logger.error('Failed to load dictionaries:', error);
        setError('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [currentDictionary]);

  // ISSUE #6 FIX: Check for existing entry in selected dictionary
  useEffect(() => {
    if (!selectedDictionary || !dictionaries || !fullEntry) {
      setWarning(null);
      setInfo(null);
      return;
    }

    const targetDict = dictionaries[selectedDictionary];
    if (!targetDict) {
      setWarning(null);
      setInfo(null);
      return;
    }

    const existingEntry = targetDict[fullEntry.source];
    if (existingEntry) {
      const existingTranslation =
        typeof existingEntry === 'string' ? existingEntry : existingEntry.translation;
      setWarning(
        `Entry "${fullEntry.source}" already exists in target dictionary with translation "${existingTranslation}". Moving will overwrite it.`
      );
    } else {
      setWarning(null);
    }
  }, [selectedDictionary, dictionaries, fullEntry]);

  // ISSUE #9 FIX: Validate dictionary type compatibility and warn about metadata loss
  useEffect(() => {
    if (!selectedDictionary || !fullEntry || !fullEntry.metadata) {
      setInfo(null);
      return;
    }

    const hasMetadata = fullEntry.metadata.allowAsPatternVariable || fullEntry.metadata.lowPriority;

    if (!hasMetadata) {
      setInfo(null);
      return;
    }

    // Check if target dictionary supports metadata
    const supportsMetadata = selectedDictionary === 'phrases' || selectedDictionary === 'patterns';

    if (!supportsMetadata) {
      const metadataFlags: string[] = [];
      if (fullEntry.metadata.allowAsPatternVariable) metadataFlags.push('allowAsPatternVariable');
      if (fullEntry.metadata.lowPriority) metadataFlags.push('lowPriority');

      setInfo(
        `Moving to ${selectedDictionary} will lose metadata: ${metadataFlags.join(', ')}. Only phrases and patterns dictionaries preserve metadata.`
      );
    } else {
      setInfo(null);
    }
  }, [selectedDictionary, fullEntry]);

  // Get readable dictionary name
  const getReadableDictName = useCallback(
    (dictId: string): string => {
      const dict = availableDictionaries.find((d) => d.id === dictId);
      return dict?.label || dictId;
    },
    [availableDictionaries]
  );

  // ISSUE #1 FIX: Handle move with atomic operation and rollback
  const handleMove = async (): Promise<void> => {
    if (!selectedDictionary) {
      setError('Please select a destination dictionary');
      return;
    }

    if (!fullEntry) {
      setError('Entry data not loaded');
      return;
    }

    setIsMoving(true);
    setError(null);

    try {
      logger.log('Starting move operation:', {
        source: fullEntry.source,
        from: currentDictionary,
        to: selectedDictionary,
        metadata: fullEntry.metadata,
      });

      // ISSUE #2 FIX: Preserve metadata when moving
      const metadata =
        selectedDictionary === 'phrases' || selectedDictionary === 'patterns'
          ? fullEntry.metadata || {}
          : {};

      // Step 1: Add to target dictionary
      await addEntry(selectedDictionary, fullEntry.source, fullEntry.translation, metadata);
      logger.log('✅ Added entry to target dictionary');

      try {
        // Step 2: Delete from source dictionary
        await deleteEntry(currentDictionary, fullEntry.source);
        logger.log('✅ Deleted entry from source dictionary');

        // ISSUE #3 FIX: Invalidate caches after successful move
        if (window.translationEngine?.invalidateAllCaches) {
          try {
            await window.translationEngine.invalidateAllCaches(selectedDictionary);
            await window.translationEngine.invalidateAllCaches(currentDictionary);
            logger.log('✅ Caches invalidated for both dictionaries');
          } catch (cacheError) {
            // Non-critical: Log but don't fail the move
            logger.warn('Cache invalidation failed (non-critical):', cacheError);
            toast.warning('Cache invalidation failed. Use Cmd/Ctrl-R to reload.', {
              duration: 5000,
            });
          }
        }

        // ISSUE #4 FIX: Show success toast
        toast.success(`Entry moved to ${getReadableDictName(selectedDictionary)}`);
        onClose();
      } catch (deleteError) {
        // CRITICAL: Rollback - remove from target if delete from source failed
        logger.error('❌ Failed to delete from source, rolling back:', deleteError);

        try {
          await deleteEntry(selectedDictionary, fullEntry.source);
          logger.log('✅ Rollback completed: removed entry from target dictionary');

          toast.error('Move failed: Could not delete from source dictionary. Changes reverted.', {
            duration: 7000,
          });
        } catch (rollbackError) {
          logger.error('❌ CRITICAL: Rollback failed:', rollbackError);
          toast.error(
            'Move failed and rollback failed. Entry may be duplicated. Please check both dictionaries.',
            { duration: 10000 }
          );
        }

        throw deleteError;
      }
    } catch (err) {
      logger.error('Move operation failed:', err);
      const errorMsg = (err as Error).message || 'Unknown error';

      // ISSUE #4 FIX: Show error toast if not already shown by rollback
      if (!errorMsg.includes('rollback')) {
        toast.error(`Failed to move entry: ${errorMsg}`, { duration: 7000 });
      }

      setError(`Failed to move entry: ${errorMsg}`);
      setIsMoving(false);
    }
  };

  // Keyboard shortcut: Enter to confirm
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' && selectedDictionary && !isMoving) {
        e.preventDefault();
        handleMove();
      }
    },
    [selectedDictionary, isMoving, handleMove]
  );

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ISSUE #4 FIX: Enhanced header with entry context */}
        <div className={styles.header}>
          <h2 className={styles.title}>Move Entry</h2>
        </div>

        {/* ISSUE #5 FIX: Entry context display */}
        <div className={styles.content}>
          {fullEntry && (
            <div className={styles.entryPreview}>
              <div className={styles.previewLabel}>Moving:</div>
              <div className={styles.previewText}>
                <span className={styles.previewSource}>"{fullEntry.source}"</span>
                <span className={styles.previewArrow}>→</span>
                <span className={styles.previewTranslation}>"{fullEntry.translation}"</span>
              </div>
              {fullEntry.metadata &&
                (fullEntry.metadata.allowAsPatternVariable || fullEntry.metadata.lowPriority) && (
                  <div className={styles.previewMetadata}>
                    {fullEntry.metadata.allowAsPatternVariable && (
                      <span className={styles.metadataTag}>Variable</span>
                    )}
                    {fullEntry.metadata.lowPriority && (
                      <span className={styles.metadataTag}>Low Priority</span>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* ISSUE #7 FIX: Show source dictionary */}
          <div className={styles.formGroup}>
            <label className={styles.label}>From:</label>
            <div className={styles.readOnlyField}>{sourceDictionaryLabel}</div>
          </div>

          {/* Destination dictionary selection */}
          <div className={styles.formGroup}>
            <label className={styles.label}>To:</label>
            <select
              value={selectedDictionary}
              onChange={(e) => setSelectedDictionary(e.target.value)}
              disabled={isMoving}
              className={`${styles.select} ${error ? styles.selectWithError : ''}`}
              autoFocus
            >
              <option value="">Choose destination dictionary...</option>
              {availableDictionaries.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* ISSUE #6 FIX: Existing entry warning */}
          {warning && (
            <div className={styles.notification}>
              <div className={`${styles.notificationContent} ${styles.notificationWarning}`}>
                <AlertTriangle size={16} className={styles.notificationIcon} />
                <div className={styles.notificationText}>{warning}</div>
              </div>
            </div>
          )}

          {/* ISSUE #10 FIX: Metadata loss info */}
          {info && (
            <div className={styles.notification}>
              <div className={`${styles.notificationContent} ${styles.notificationInfo}`}>
                <Info size={16} className={styles.notificationIcon} />
                <div className={styles.notificationText}>{info}</div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Footer with Buttons */}
        <div className={styles.footer}>
          <button onClick={onClose} disabled={isMoving} className={styles.cancelButton}>
            Cancel
          </button>
          <button
            onClick={handleMove}
            className={styles.moveButton}
            disabled={isMoving || !selectedDictionary}
            title={!selectedDictionary ? 'Select a destination dictionary first' : undefined}
          >
            {isMoving ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Moving...</span>
              </>
            ) : (
              'Move Entry'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveEntryDialog;

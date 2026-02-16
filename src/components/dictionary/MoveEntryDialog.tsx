import React, { useState, useEffect, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes } from './DictionaryTypes';
import { X, AlertTriangle, Info } from 'lucide-react';
import styles from '../../styles/MoveEntryDialog.module.css';
import { logger } from '../../utils/logger';
import { getDictionaryDropdownLabel, compareDictionaryOrder } from '../../utils/dictionaryHelpers';
import type { MoveEntryData, DictionaryEntryMetadata } from '../../types/DictionaryTypes';

/**
 * Full entry data with all metadata extracted from dictionary
 */
interface FullEntryData {
  source: string;
  translation: string;
  metadata?: DictionaryEntryMetadata;
}

/**
 * Available dictionary option
 */
interface AvailableDictionary {
  id: string;
  label: string;
}

/**
 * Props for MoveEntryDialog component
 */
interface MoveEntryDialogProps {
  entry: MoveEntryData;
  onClose: () => void;
  currentDictionary: string;
}

const MoveEntryDialog: React.FC<MoveEntryDialogProps> = ({ entry, onClose, currentDictionary }) => {
  const [selectedDictionary, setSelectedDictionary] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [availableDictionaries, setAvailableDictionaries] = useState<AvailableDictionary[]>([]);
  const [fullEntry, setFullEntry] = useState<FullEntryData | null>(null);
  const [sourceDictionaryLabel, setSourceDictionaryLabel] = useState<string>('');

  const { moveEntry, dictionaries } = useDictionary();

  // Extract full entry data with ALL metadata from current dictionary
  useEffect(() => {
    const extractFullEntry = (): void => {
      if (!dictionaries || !dictionaries[currentDictionary]) {
        setFullEntry({ source: entry.source, translation: entry.translation });
        return;
      }

      const value = dictionaries[currentDictionary][entry.source];

      if (!value) {
        logger.warn('Entry not found in dictionary:', entry.source);
        setFullEntry({ source: entry.source, translation: entry.translation });
        return;
      }

      if (typeof value === 'object') {
        setFullEntry({
          source: entry.source,
          translation: value.translation,
          metadata: {
            allowAsPatternVariable: value.allowAsPatternVariable,
            lowPriority: value.lowPriority,
            semanticType: value.semanticType,
            allowedVariableTypes: value.allowedVariableTypes,
          },
        });
      } else {
        setFullEntry({ source: entry.source, translation: value });
      }
    };

    extractFullEntry();
  }, [entry, currentDictionary, dictionaries]);

  // Load available dictionaries and resolve readable names
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();

        setSourceDictionaryLabel(getDictionaryDropdownLabel(currentDictionary));

        const dictionaryList: AvailableDictionary[] = Object.keys(types)
          .filter((id) => id !== currentDictionary)
          .map((id) => ({ id, label: getDictionaryDropdownLabel(id) }))
          .sort(compareDictionaryOrder);

        setAvailableDictionaries(dictionaryList);
      } catch (err) {
        logger.error('Failed to load dictionaries:', err);
        setError('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [currentDictionary]);

  // Check for existing entry in selected target dictionary
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

  // Warn about metadata loss when moving to a dictionary that doesn't support it
  useEffect(() => {
    if (!selectedDictionary || !fullEntry?.metadata) {
      setInfo(null);
      return;
    }

    const { allowAsPatternVariable, lowPriority, semanticType, allowedVariableTypes } =
      fullEntry.metadata;
    const hasMetadata =
      allowAsPatternVariable ||
      lowPriority ||
      semanticType ||
      (allowedVariableTypes && Object.keys(allowedVariableTypes).length > 0);

    if (!hasMetadata) {
      setInfo(null);
      return;
    }

    const supportsMetadata = selectedDictionary === 'phrases' || selectedDictionary === 'patterns';
    if (!supportsMetadata) {
      const flags: string[] = [];
      if (allowAsPatternVariable) flags.push('allowAsPatternVariable');
      if (lowPriority) flags.push('lowPriority');
      if (semanticType) flags.push(`semanticType (${semanticType})`);
      if (allowedVariableTypes && Object.keys(allowedVariableTypes).length > 0)
        flags.push('allowedVariableTypes');

      setInfo(
        `Moving to ${selectedDictionary} will lose metadata: ${flags.join(', ')}. Only phrases and patterns dictionaries preserve metadata.`
      );
    } else {
      setInfo(null);
    }
  }, [selectedDictionary, fullEntry]);

  const getSelectedLabel = useCallback((): string => {
    return (
      availableDictionaries.find((d) => d.id === selectedDictionary)?.label ?? selectedDictionary
    );
  }, [availableDictionaries, selectedDictionary]);

  const handleMove = useCallback(async (): Promise<void> => {
    if (!selectedDictionary || !fullEntry) return;

    setIsMoving(true);
    setError(null);

    try {
      await moveEntry(currentDictionary, selectedDictionary, fullEntry.source, getSelectedLabel());
      onClose();
    } catch (err) {
      logger.error('Move operation failed:', err);
      const message = (err as Error)?.message || 'Unknown error';
      setError(`Failed to move entry: ${message}`);
      setIsMoving(false);
    }
  }, [selectedDictionary, fullEntry, moveEntry, currentDictionary, getSelectedLabel, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' && selectedDictionary && !isMoving) {
        e.preventDefault();
        handleMove();
      } else if (e.key === 'Escape' && !isMoving) {
        onClose();
      }
    },
    [selectedDictionary, isMoving, handleMove, onClose]
  );

  return (
    <div className={styles.overlay} onClick={isMoving ? undefined : onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-entry-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="move-entry-dialog-title" className={styles.title}>
            Move Entry
          </h2>
          <button
            onClick={onClose}
            disabled={isMoving}
            className={styles.closeButton}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Entry context display */}
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
                (fullEntry.metadata.allowAsPatternVariable ||
                  fullEntry.metadata.lowPriority ||
                  fullEntry.metadata.semanticType ||
                  (fullEntry.metadata.allowedVariableTypes &&
                    Object.keys(fullEntry.metadata.allowedVariableTypes).length > 0)) && (
                  <div className={styles.previewMetadata}>
                    {fullEntry.metadata.allowAsPatternVariable && (
                      <span className={styles.metadataTag}>Variable</span>
                    )}
                    {fullEntry.metadata.lowPriority && (
                      <span className={styles.metadataTag}>Low Priority</span>
                    )}
                    {fullEntry.metadata.semanticType && (
                      <span className={styles.metadataTag}>{fullEntry.metadata.semanticType}</span>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* Source dictionary */}
          <div className={styles.formGroup}>
            <label className={styles.label}>From:</label>
            <div className={styles.readOnlyField}>{sourceDictionaryLabel}</div>
          </div>

          {/* Destination dictionary */}
          <div className={styles.formGroup}>
            <label htmlFor="move-target-dict" className={styles.label}>
              To:
            </label>
            {availableDictionaries.length === 0 ? (
              <div className={styles.emptyState}>
                No other dictionaries available. Create another dictionary first.
              </div>
            ) : (
              <select
                id="move-target-dict"
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
            )}
          </div>

          {/* Overwrite warning */}
          {warning && (
            <div className={styles.notification}>
              <div className={`${styles.notificationContent} ${styles.notificationWarning}`}>
                <AlertTriangle size={16} className={styles.notificationIcon} />
                <div className={styles.notificationText}>{warning}</div>
              </div>
            </div>
          )}

          {/* Metadata loss info */}
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

        {/* Footer */}
        <div className={styles.footer}>
          <button onClick={onClose} disabled={isMoving} className={styles.cancelButton}>
            Cancel
          </button>
          <button
            onClick={handleMove}
            className={styles.moveButton}
            disabled={isMoving || !selectedDictionary || availableDictionaries.length === 0}
            title={!selectedDictionary ? 'Select a destination dictionary first' : undefined}
          >
            {isMoving ? 'Moving...' : 'Move Entry'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveEntryDialog;

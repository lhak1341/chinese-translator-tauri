import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { X, AlertTriangle, Info, Loader } from 'lucide-react';
import styles from '../../styles/MoveDialog.module.css';
import { logger } from '../../utils/logger';
import { useMoveTargetDictionaries } from '../../hooks/useMoveTargetDictionaries';
import type { DictionaryEntryMetadata } from '../../types/DictionaryTypes';
import { SEMANTIC_TYPE_LABELS } from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';

/**
 * Full entry data with all metadata extracted from dictionary
 */
interface FullEntryData {
  source: string;
  translation: string;
  metadata?: DictionaryEntryMetadata;
}

export interface MoveDialogProps {
  entries: string[];
  currentDictionary: string;
  onClose: () => void;
  onSuccess?: () => void;
}

function hasMetadata(metadata: DictionaryEntryMetadata | undefined): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.allowAsPatternVariable ||
    metadata.semanticType ||
    (metadata.allowedVariableTypes && Object.keys(metadata.allowedVariableTypes).length > 0)
  );
}

function metadataFlags(metadata: DictionaryEntryMetadata): string[] {
  const flags: string[] = [];
  if (metadata.allowAsPatternVariable) flags.push('allowAsPatternVariable');
  if (metadata.semanticType) flags.push(`semanticType (${metadata.semanticType})`);
  if (metadata.allowedVariableTypes && Object.keys(metadata.allowedVariableTypes).length > 0)
    flags.push('allowedVariableTypes');
  return flags;
}

const MoveDialog: React.FC<MoveDialogProps> = ({
  entries,
  currentDictionary,
  onClose,
  onSuccess,
}) => {
  const [selectedDictionary, setSelectedDictionary] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { moveEntry, bulkMoveEntries, dictionaries } = useDictionary();
  const { availableDictionaries, sourceLabel: sourceDictionaryLabel } = useMoveTargetDictionaries(
    currentDictionary,
    setError
  );

  const isSingle = entries.length === 1;

  // Full entry data (with metadata) for every entry being moved, read from current dictionary state.
  const fullEntries = useMemo<FullEntryData[]>(() => {
    const currentDict = dictionaries?.[currentDictionary];
    return entries.map((source) => {
      const value = currentDict?.[source];
      if (value === undefined) {
        logger.warn('Entry not found in dictionary:', source);
        return { source, translation: source };
      }
      if (typeof value === 'object') {
        return {
          source,
          translation: value.translation,
          metadata: {
            allowAsPatternVariable: value.allowAsPatternVariable,
            semanticType: value.semanticType,
            allowedVariableTypes: value.allowedVariableTypes,
          },
        };
      }
      return { source, translation: value };
    });
  }, [entries, dictionaries, currentDictionary]);

  // Check for existing entries in the selected target dictionary.
  useEffect(() => {
    if (!selectedDictionary || !dictionaries) {
      setWarning(null);
      return;
    }
    const targetDict = dictionaries[selectedDictionary];
    if (!targetDict) {
      setWarning(null);
      return;
    }

    const existing = fullEntries.filter((e) => targetDict[e.source] !== undefined);
    if (existing.length === 0) {
      setWarning(null);
      return;
    }

    if (isSingle) {
      const existingEntry = targetDict[existing[0].source];
      const existingTranslation =
        typeof existingEntry === 'string' ? existingEntry : existingEntry.translation;
      setWarning(
        `Entry "${existing[0].source}" already exists in target dictionary with translation "${existingTranslation}". Moving will overwrite it.`
      );
    } else {
      setWarning(
        `${existing.length} ${existing.length === 1 ? 'entry' : 'entries'} already exist in target and will be overwritten.`
      );
    }
  }, [selectedDictionary, dictionaries, fullEntries, isSingle]);

  // Warn about metadata loss when moving to a dictionary that doesn't support it.
  useEffect(() => {
    if (!selectedDictionary) {
      setInfo(null);
      return;
    }

    const supportsMetadata =
      selectedDictionary === 'phrases' || selectedDictionary.startsWith('patterns');
    if (supportsMetadata) {
      setInfo(null);
      return;
    }

    const withMetadata = fullEntries.filter((e) => hasMetadata(e.metadata));
    if (withMetadata.length === 0) {
      setInfo(null);
      return;
    }

    if (isSingle) {
      const flags = metadataFlags(withMetadata[0].metadata as DictionaryEntryMetadata);
      setInfo(
        `Moving to ${selectedDictionary} will lose metadata: ${flags.join(', ')}. Only phrases and patterns dictionaries preserve metadata.`
      );
    } else {
      setInfo(
        `${withMetadata.length} ${withMetadata.length === 1 ? 'entry has' : 'entries have'} metadata that will be lost. Only phrases and patterns dictionaries preserve metadata.`
      );
    }
  }, [selectedDictionary, fullEntries, isSingle]);

  const getSelectedLabel = useCallback((): string => {
    return (
      availableDictionaries.find((d) => d.id === selectedDictionary)?.label ?? selectedDictionary
    );
  }, [availableDictionaries, selectedDictionary]);

  const handleMove = useCallback(async (): Promise<void> => {
    if (!selectedDictionary || fullEntries.length === 0) return;

    setIsMoving(true);
    setError(null);

    try {
      if (isSingle) {
        await moveEntry(
          currentDictionary,
          selectedDictionary,
          fullEntries[0].source,
          getSelectedLabel()
        );
      } else {
        await bulkMoveEntries(
          currentDictionary,
          selectedDictionary,
          fullEntries.map((e) => e.source),
          getSelectedLabel()
        );
      }
      onClose();
      onSuccess?.();
    } catch (err) {
      logger.error('Move operation failed:', err);
      const message = (err as Error)?.message || 'Unknown error';
      setError(`Failed to move ${isSingle ? 'entry' : 'entries'}: ${message}`);
      setIsMoving(false);
    }
  }, [
    selectedDictionary,
    fullEntries,
    isSingle,
    moveEntry,
    bulkMoveEntries,
    currentDictionary,
    getSelectedLabel,
    onClose,
    onSuccess,
  ]);

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

  const previewEntries = fullEntries.slice(0, 3);
  const hasMorePreview = fullEntries.length > 3;
  const title = isSingle ? 'Move Entry' : `Move ${fullEntries.length} Entries`;
  const buttonLabel = isSingle ? 'Move Entry' : `Move ${fullEntries.length} Entries`;

  return (
    <div className={styles.overlay} onClick={isMoving ? undefined : onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="move-dialog-title" className={styles.title}>
            {title}
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
          {isSingle && fullEntries[0] && (
            <div className={styles.entryPreview}>
              <div className={styles.previewLabel}>Moving:</div>
              <div className={styles.previewText}>
                <span className={styles.previewSource}>"{fullEntries[0].source}"</span>
                <span className={styles.previewArrow}>→</span>
                <span className={styles.previewTranslation}>"{fullEntries[0].translation}"</span>
              </div>
              {hasMetadata(fullEntries[0].metadata) && (
                <div className={styles.previewMetadata}>
                  {fullEntries[0].metadata?.allowAsPatternVariable && (
                    <span className={styles.metadataTag}>Variable</span>
                  )}
                  {fullEntries[0].metadata?.semanticType && (
                    <span className={styles.metadataTag}>
                      {SEMANTIC_TYPE_LABELS[fullEntries[0].metadata.semanticType as SemanticType] ??
                        fullEntries[0].metadata.semanticType}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {!isSingle && (
            <div className={styles.entryPreview}>
              <div className={styles.previewLabel}>Moving:</div>
              <div className={styles.previewList}>
                {previewEntries.map((e) => (
                  <div key={e.source} className={styles.previewListItem}>
                    <span className={styles.previewSource}>"{e.source}"</span>
                    <span className={styles.previewArrow}>→</span>
                    <span className={styles.previewTranslation}>"{e.translation}"</span>
                  </div>
                ))}
              </div>
              {hasMorePreview && (
                <div className={styles.previewMore}>
                  ...and {fullEntries.length - 3} more{' '}
                  {fullEntries.length - 3 === 1 ? 'entry' : 'entries'}
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
            {isMoving ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Moving...</span>
              </>
            ) : (
              buttonLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveDialog;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDictionary } from './DictionaryContext';
import { X, AlertTriangle, Loader } from 'lucide-react';
import styles from '../../styles/MoveDialog.module.css';
import { logger } from '../../utils/logger';
import { entryFields } from '../../utils/dictionary';
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

const MoveDialog: React.FC<MoveDialogProps> = ({
  entries,
  currentDictionary,
  onClose,
  onSuccess,
}) => {
  const [selectedDictionary, setSelectedDictionary] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { moveEntry, bulkMoveEntries, dictionaries, loadDictionary } = useDictionary();
  const { availableDictionaries, sourceLabel: sourceDictionaryLabel } =
    useMoveTargetDictionaries(currentDictionary);

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

  // Targets are loaded lazily (fiction dicts are only in memory once opened). Load the chosen
  // target on selection so the overwrite check below can see it and moveEntry doesn't reject it
  // as "does not exist".
  const [isLoadingTarget, setIsLoadingTarget] = useState<boolean>(false);
  const targetLoaded = Boolean(selectedDictionary && dictionaries?.[selectedDictionary]);
  useEffect(() => {
    if (!selectedDictionary || targetLoaded) return;
    let cancelled = false;
    setIsLoadingTarget(true);
    loadDictionary(selectedDictionary)
      .catch((err: unknown) => logger.error('Failed to load move target:', err))
      .finally(() => {
        if (!cancelled) setIsLoadingTarget(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDictionary, targetLoaded, loadDictionary]);

  // Entries that already exist in the target and would be overwritten.
  const warning = useMemo<string | null>(() => {
    const targetDict = selectedDictionary ? dictionaries?.[selectedDictionary] : undefined;
    if (!targetDict) return null;

    const existing = fullEntries.filter((e) => targetDict[e.source] !== undefined);
    if (existing.length === 0) return null;

    if (isSingle) {
      const existingEntry = targetDict[existing[0].source];
      const existingTranslation = entryFields(existingEntry).translation;
      return `Entry "${existing[0].source}" already exists in target dictionary with translation "${existingTranslation}". Moving will overwrite it.`;
    }
    return `${existing.length} ${existing.length === 1 ? 'entry' : 'entries'} already exist in target and will be overwritten.`;
  }, [selectedDictionary, dictionaries, fullEntries, isSingle]);

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
      if (e.key === 'Enter' && selectedDictionary && !isMoving && !isLoadingTarget) {
        e.preventDefault();
        handleMove();
      } else if (e.key === 'Escape' && !isMoving) {
        onClose();
      }
    },
    [selectedDictionary, isMoving, isLoadingTarget, handleMove, onClose]
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
                No compatible dictionaries. Patterns move only between pattern dictionaries; phrases
                and proper nouns move between each other.
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
            disabled={
              isMoving ||
              isLoadingTarget ||
              !selectedDictionary ||
              availableDictionaries.length === 0
            }
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

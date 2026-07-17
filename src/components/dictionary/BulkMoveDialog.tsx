import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader, X } from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import { logger } from '../../utils/logger';
import { useMoveTargetDictionaries } from '../../hooks/useMoveTargetDictionaries';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

export interface BulkMoveDialogProps {
  selectedDictionary: string;
  selectedEntries: Set<string>;
  onClose: () => void;
  onMoveSuccess: () => void;
}

/**
 * Bulk Move Dialog — lives at module scope to avoid re-creating a component
 * type (with hooks) on every parent render.
 */
const BulkMoveDialog: React.FC<BulkMoveDialogProps> = ({
  selectedDictionary,
  selectedEntries,
  onClose,
  onMoveSuccess,
}) => {
  const { bulkMoveEntries, dictionaries } = useDictionary();
  const [selectedTargetDict, setSelectedTargetDict] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [overwriteWarning, setOverwriteWarning] = useState<string | null>(null);
  const { availableDictionaries, sourceLabel } = useMoveTargetDictionaries(
    selectedDictionary,
    setError
  );

  // Check for entries that would be overwritten in the selected target
  useEffect(() => {
    if (!selectedTargetDict || !dictionaries?.[selectedTargetDict]) {
      setOverwriteWarning(null);
      return;
    }
    const targetDict = dictionaries[selectedTargetDict];
    const sources = Array.from(selectedEntries);
    const willOverwrite = sources.filter((s) => targetDict[s] !== undefined);
    if (willOverwrite.length > 0) {
      setOverwriteWarning(
        `${willOverwrite.length} ${willOverwrite.length === 1 ? 'entry' : 'entries'} already exist in target and will be overwritten.`
      );
    } else {
      setOverwriteWarning(null);
    }
  }, [selectedTargetDict, dictionaries, selectedEntries]);

  const getTargetLabel = (): string =>
    availableDictionaries.find((d) => d.id === selectedTargetDict)?.label ?? selectedTargetDict;

  const handleBulkMoveExecute = async (): Promise<void> => {
    if (!selectedTargetDict) {
      setError('Please select a target dictionary');
      return;
    }

    setIsMoving(true);
    setError(null);

    try {
      await bulkMoveEntries(
        selectedDictionary,
        selectedTargetDict,
        Array.from(selectedEntries),
        getTargetLabel()
      );
      onMoveSuccess();
    } catch (err) {
      setError(`Failed to move entries: ${(err as Error).message}`);
      logger.error('Bulk move error:', err);
      setIsMoving(false);
    }
  };

  // Get preview entries (first 3)
  const previewEntries = Array.from(selectedEntries).slice(0, 3);
  const hasMore = selectedEntries.size > 3;
  const currentDict = dictionaries[selectedDictionary];

  return (
    <div className={styles.bulkMoveOverlay} onClick={isMoving ? undefined : onClose}>
      <div className={styles.bulkMoveModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.bulkMoveHeader}>
          <h2 className={styles.bulkMoveTitle}>
            Move {selectedEntries.size} {selectedEntries.size === 1 ? 'Entry' : 'Entries'}
          </h2>
          <button
            onClick={onClose}
            disabled={isMoving}
            className={styles.bulkMoveCloseButton}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.bulkMoveContent}>
          {/* Entry Preview */}
          <div className={styles.bulkMovePreview}>
            <div className={styles.bulkMovePreviewLabel}>Moving:</div>
            <div className={styles.bulkMovePreviewList}>
              {previewEntries.map((source) => {
                const entry = currentDict?.[source];
                const translation = typeof entry === 'string' ? entry : entry?.translation || '';
                return (
                  <div key={source} className={styles.bulkMovePreviewItem}>
                    <span className={styles.bulkMovePreviewSource}>"{source}"</span>
                    <span className={styles.bulkMovePreviewArrow}>→</span>
                    <span className={styles.bulkMovePreviewTranslation}>"{translation}"</span>
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <div className={styles.bulkMovePreviewMore}>
                ...and {selectedEntries.size - 3} more{' '}
                {selectedEntries.size - 3 === 1 ? 'entry' : 'entries'}
              </div>
            )}
          </div>

          {/* Source Dictionary */}
          <div className={styles.bulkMoveFormGroup}>
            <label className={styles.bulkMoveLabel}>From:</label>
            <div className={styles.bulkMoveReadOnlyField}>{sourceLabel}</div>
          </div>

          {/* Destination Dictionary */}
          <div className={styles.bulkMoveFormGroup}>
            <label className={styles.bulkMoveLabel}>To:</label>
            {availableDictionaries.length === 0 ? (
              <div className={styles.bulkMoveEmptyState}>
                No other dictionaries available. Create another dictionary first.
              </div>
            ) : (
              <select
                value={selectedTargetDict}
                onChange={(e) => setSelectedTargetDict(e.target.value)}
                disabled={isMoving}
                className={`${styles.bulkMoveSelect} ${error ? styles.bulkMoveSelectWithError : ''}`}
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
          {overwriteWarning && (
            <div className={styles.bulkMoveWarning}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>{overwriteWarning}</span>
            </div>
          )}

          {error && <div className={styles.bulkMoveError}>{error}</div>}
        </div>

        <div className={styles.bulkMoveActions}>
          <button onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button
            onClick={handleBulkMoveExecute}
            className="primary"
            disabled={isMoving || !selectedTargetDict || availableDictionaries.length === 0}
          >
            {isMoving ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Moving...</span>
              </>
            ) : (
              `Move ${selectedEntries.size} ${selectedEntries.size === 1 ? 'Entry' : 'Entries'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkMoveDialog;

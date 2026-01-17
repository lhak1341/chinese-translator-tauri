import React, { useState, useEffect } from 'react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes } from './DictionaryTypes';
import { Loader } from 'lucide-react';
import styles from '../../styles/MoveEntryDialog.module.css';

/**
 * Dictionary entry to be moved
 */
interface DictionaryEntry {
  source: string;
  translation: string;
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
  entry: DictionaryEntry;
  onClose: () => void;
  currentDictionary: string;
}

/**
 * MoveEntryDialog Component
 *
 * Modal dialog for moving dictionary entries between dictionaries.
 * Provides dropdown selection of available dictionaries and handles
 * the move operation with loading states and error handling.
 *
 * @param props - Component props
 * @returns Modal dialog for moving entries
 */
const MoveEntryDialog: React.FC<MoveEntryDialogProps> = ({ entry, onClose, currentDictionary }) => {
  const [selectedDictionary, setSelectedDictionary] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDictionaries, setAvailableDictionaries] = useState<AvailableDictionary[]>([]);

  const { addEntry, deleteEntry } = useDictionary();

  // Load fresh dictionary list on mount to pick up renamed dictionaries
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();
        const dictionaryList: AvailableDictionary[] = Object.keys(types)
          .filter((id) => id !== currentDictionary)
          .map((id) => ({
            id,
            label:
              id === 'properNouns'
                ? 'General Purpose Dictionary'
                : id.startsWith('properNouns-')
                  ? `Proper Nouns - ${id.replace('properNouns-', '')}`
                  : id.charAt(0).toUpperCase() + id.slice(1),
          }))
          .sort((a, b) => {
            // Always put 'properNouns' first
            if (a.id === 'properNouns') return -1;
            if (b.id === 'properNouns') return 1;
            // Sort custom dictionaries alphabetically
            return a.id.localeCompare(b.id);
          });
        setAvailableDictionaries(dictionaryList);
      } catch (error) {
        console.error('Failed to load dictionaries:', error);
        setError('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [currentDictionary]);

  // Handle the move operation
  const handleMove = async (): Promise<void> => {
    if (!selectedDictionary) {
      setError('Please select a dictionary');
      return;
    }

    setIsMoving(true);
    setError(null);

    try {
      await addEntry(selectedDictionary, entry.source, entry.translation);
      await deleteEntry(currentDictionary, entry.source);
      onClose();
    } catch (err) {
      setError('Failed to move entry: ' + ((err as Error).message || 'Unknown error'));
      setIsMoving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Simple Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Move Entry</h2>
        </div>

        {/* Minimal Content */}
        <div className={styles.content}>
          <select
            value={selectedDictionary}
            onChange={(e) => setSelectedDictionary(e.target.value)}
            disabled={isMoving}
            className={`${styles.select} ${error ? styles.selectWithError : ''}`}
          >
            <option value="">Select a dictionary...</option>
            {availableDictionaries.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Footer with Buttons */}
        <div className={styles.footer}>
          <button onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button
            onClick={handleMove}
            className="primary"
            disabled={isMoving || !selectedDictionary}
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

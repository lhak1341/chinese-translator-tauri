import React, { useState, useEffect } from 'react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes } from './DictionaryTypes';
import { Loader } from 'lucide-react';

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--background-color)',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: '400px',
          position: 'relative',
          border: '1px solid var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simple Header */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid var(--border-color)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Move Entry</h2>
        </div>

        {/* Minimal Content */}
        <div style={{ padding: '1rem' }}>
          <select
            value={selectedDictionary}
            onChange={(e) => setSelectedDictionary(e.target.value)}
            disabled={isMoving}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--background-color)',
              color: 'var(--text-color)',
              marginBottom: error ? '0.75rem' : 0,
            }}
          >
            <option value="">Select a dictionary...</option>
            {availableDictionaries.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>

          {error && (
            <div
              style={{
                color: 'var(--danger-button-text)',
                fontSize: '0.875rem',
                marginTop: '0.5rem',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer with Buttons */}
        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
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

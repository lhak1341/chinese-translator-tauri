import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Edit2,
  Trash2,
  AlertCircle,
  Loader,
  MoveIcon,
  ChevronsUp,
  ChevronsDown,
} from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import DictionaryEntry from './DictionaryEntry';
import MoveEntryDialog from './MoveEntryDialog';

/**
 * Dictionary entry value type (can be string or object with metadata)
 */
type DictionaryEntryValue = string | {
  translation: string;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
};

/**
 * Dictionary entry data structure for editing
 */
interface EditingEntryData {
  source: string;
  translation: string;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

/**
 * Dictionary entry data structure for moving
 */
interface MoveEntryData {
  source: string;
  translation: string;
}

/**
 * Props for DictionaryTable component
 */
interface DictionaryTableProps {
  /** Currently selected dictionary ID */
  selectedDictionary: string;
}

/**
 * DictionaryTable Component
 *
 * Displays dictionary entries in a searchable table format with CRUD operations.
 * Features:
 * - Search filtering by source or translation
 * - Edit entries via modal
 * - Delete entries with confirmation
 * - Move entries to other dictionaries
 * - Scroll to top/bottom controls
 *
 * @param props - Component props
 * @returns Dictionary table with search and CRUD operations
 */
const DictionaryTable: React.FC<DictionaryTableProps> = ({ selectedDictionary }) => {
  // Core dictionary operations and loading state from context
  const { dictionaries, deleteEntry, isLoading } = useDictionary();

  // State management for table operations
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);

  // Reference for the scrollable table container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Reset all states when dictionary selection changes
  useEffect(() => {
    setSearchTerm('');
    setEditingEntry(null);
    setShowConfirmDelete(null);
    setDeleteError(null);
    setMoveEntry(null);
  }, [selectedDictionary]);

  // Memoized filtering of dictionary entries based on search term
  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    const entries: [string, DictionaryEntryValue][] = Object.entries(dictionary);
    if (!searchTerm) return entries;

    // Case-insensitive search in both source and translation
    return entries.filter(
      ([source, translation]: [string, DictionaryEntryValue]) => {
        const translationText = typeof translation === 'string' ? translation : translation.translation;
        return source.toLowerCase().includes(searchTerm.toLowerCase()) ||
               translationText.toLowerCase().includes(searchTerm.toLowerCase());
      }
    );
  }, [dictionaries, selectedDictionary, searchTerm]);

  // Scroll handling functions
  const scrollToTop = (): void => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  const scrollToBottom = (): void => {
    if (tableContainerRef.current) {
      const scrollHeight = tableContainerRef.current.scrollHeight;
      tableContainerRef.current.scrollTo({
        top: scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Handle entry deletion with confirmation step
  const handleDelete = async (source: string): Promise<void> => {
    if (showConfirmDelete === source) {
      setIsDeleting(true);
      setDeleteError(null);
      try {
        await deleteEntry(selectedDictionary, source);
        setShowConfirmDelete(null);
      } catch (err) {
        setDeleteError(`Failed to delete entry: ${source}`);
        console.error('Error deleting entry:', err);
      } finally {
        setIsDeleting(false);
      }
    } else {
      setShowConfirmDelete(source);
    }
  };

  // Loading state display
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
        }}
      >
        <Loader size={24} className="animate-spin" />
        <span>Loading dictionary...</span>
      </div>
    );
  }

  // Main component render
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar and scroll controls container */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {/* Search input */}
        <input
          type="text"
          placeholder="Search entries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--background-color)',
            color: 'var(--text-color)',
            fontSize: '0.875rem',
          }}
        />

        {/* Scroll controls */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={scrollToTop}
            className="icon"
            title="Scroll to top"
            style={{
              padding: '0.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={scrollToBottom}
            className="icon"
            title="Scroll to bottom"
            style={{
              padding: '0.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronsDown size={16} />
          </button>
        </div>
      </div>

      {/* Error message display */}
      {deleteError && (
        <div
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--danger-button-bg)',
            color: 'var(--danger-button-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={16} />
          {deleteError}
        </div>
      )}

      {/* Table container */}
      <div
        ref={tableContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th
                style={{
                  width: '40%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                }}
              >
                Source Text
              </th>
              <th
                style={{
                  width: '40%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                }}
              >
                Translation
              </th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map(([source, translation]: [string, DictionaryEntryValue]) => {
              // Handle both old format (string) and new format (object with metadata)
              const translationText = typeof translation === 'string' ? translation : translation.translation;
              const allowAsPatternVariable = typeof translation === 'object' && translation !== null && 'allowAsPatternVariable' in translation && translation.allowAsPatternVariable === true;
              const lowPriority = typeof translation === 'object' && translation !== null && 'lowPriority' in translation && translation.lowPriority === true;

              return (
                <tr key={source}>
                  <td style={{ padding: '0.5rem 1rem' }}>{source}</td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    {translationText}
                    {allowAsPatternVariable && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.8em', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                        [X]
                      </span>
                    )}
                    {lowPriority && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.8em', color: '#ff8c00', fontWeight: 'bold' }}>
                        [LP]
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => setEditingEntry({
                        source,
                        translation: translationText,
                        allowAsPatternVariable,
                        lowPriority
                      })}
                      className="icon"
                      disabled={isDeleting}
                      title="Edit entry"
                    >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => setMoveEntry({ source, translation: translationText })}
                    className="icon"
                    disabled={isDeleting}
                    title="Move to another dictionary"
                  >
                    <MoveIcon size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(source)}
                    className={`icon ${
                      showConfirmDelete === source ? 'danger' : ''
                    }`}
                    disabled={isDeleting}
                    title={
                      showConfirmDelete === source
                        ? 'Click to confirm deletion'
                        : 'Delete entry'
                    }
                  >
                    {isDeleting && showConfirmDelete === source ? (
                      <Loader size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal dialogs */}
      {editingEntry && React.createElement(DictionaryEntry as any, {
        entry: editingEntry,
        onClose: () => setEditingEntry(null),
        selectedDictionary: selectedDictionary
      })}

      {moveEntry && React.createElement(MoveEntryDialog as any, {
        entry: moveEntry,
        currentDictionary: selectedDictionary,
        onClose: () => setMoveEntry(null)
      })}
    </div>
  );
};

export default DictionaryTable;

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
import { adaptiveBufferCalculator } from '../../utils/AdaptiveVirtualScrolling.js';
import styles from '../../styles/VirtualizedDictionaryTable.module.css';

/**
 * Dictionary entry value type (can be string or object with metadata)
 */
type DictionaryEntryValue =
  | string
  | {
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
 * Props for VirtualizedDictionaryTable component
 */
interface VirtualizedDictionaryTableProps {
  /** Currently selected dictionary ID */
  selectedDictionary: string;
  /** Optional ref for search input (for keyboard shortcut focus) */
  searchRef?: React.RefObject<HTMLInputElement>;
}

const ITEM_HEIGHT = 40; // Height of each table row in pixels
// OPTIMIZATION: Dynamic buffer sizing replaced fixed BUFFER_SIZE = 5
// Now calculated based on device performance, viewport, and memory pressure

/**
 * VirtualizedDictionaryTable Component
 *
 * Virtualized table for displaying large dictionaries with adaptive performance optimization.
 * Features:
 * - Virtual scrolling with adaptive buffer sizing
 * - Search filtering by source or translation
 * - Scroll velocity tracking for smooth performance
 * - Edit, delete, and move entries
 * - Performance monitoring and metrics
 *
 * @param props - Component props
 * @returns Virtualized dictionary table with adaptive performance
 */
const VirtualizedDictionaryTable: React.FC<VirtualizedDictionaryTableProps> = ({
  selectedDictionary,
  searchRef,
}) => {
  const { dictionaries, deleteEntry, isLoading } = useDictionary();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(600);

  // OPTIMIZATION: Adaptive buffer sizing state
  const [bufferSize, setBufferSize] = useState<number>(5); // Start with default, will be optimized
  const [scrollVelocity, setScrollVelocity] = useState<number>(0);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef<number>(Date.now());
  const lastScrollTop = useRef<number>(0);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Reset states when dictionary changes
  useEffect(() => {
    setSearchTerm('');
    setEditingEntry(null);
    setShowConfirmDelete(null);
    setDeleteError(null);
    setMoveEntry(null);
    setScrollTop(0);
  }, [selectedDictionary]);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = (): void => {
      if (tableContainerRef.current) {
        setContainerHeight(tableContainerRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Memoized filtered entries (same as before but more efficient)
  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    const entries: [string, DictionaryEntryValue][] = Object.entries(dictionary);
    if (!searchTerm) return entries;

    const searchLower = searchTerm.toLowerCase();
    return entries.filter(([source, translation]: [string, DictionaryEntryValue]) => {
      const translationText =
        typeof translation === 'string' ? translation : translation.translation;
      return (
        source.toLowerCase().includes(searchLower) ||
        translationText.toLowerCase().includes(searchLower)
      );
    });
  }, [dictionaries, selectedDictionary, searchTerm]);

  // OPTIMIZATION: Adaptive buffer size calculation
  useEffect(() => {
    const calculateOptimalBuffer = async (): Promise<void> => {
      try {
        const optimalSize = await adaptiveBufferCalculator.calculateOptimalBufferSize({
          containerHeight,
          itemHeight: ITEM_HEIGHT,
          totalItems: filteredEntries.length,
          scrollVelocity,
          isScrolling,
        });

        if (optimalSize !== bufferSize) {
          setBufferSize(optimalSize);
        }
      } catch (error) {
        console.warn('Buffer size calculation failed:', error);
        // Keep current buffer size on error
      }
    };

    // Calculate on significant changes
    const debounceTimer = setTimeout(calculateOptimalBuffer, 100);
    return () => clearTimeout(debounceTimer);
  }, [containerHeight, filteredEntries.length, scrollVelocity, isScrolling, bufferSize]);

  // OPTIMIZATION: Performance monitoring for scroll events
  useEffect(() => {
    const trackPerformance = (): void => {
      const stats = adaptiveBufferCalculator.getScrollingStats();
      if (stats && !stats.isPerformant) {
        console.warn('🐌 Virtual scrolling performance degradation detected:', stats);
      }
    };

    const interval = setInterval(trackPerformance, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // OPTIMIZATION: Calculate visible range with adaptive buffer size
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - bufferSize);
  const endIndex = Math.min(
    filteredEntries.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + bufferSize
  );

  const visibleEntries = filteredEntries.slice(startIndex, endIndex);
  const totalHeight = filteredEntries.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;

  // OPTIMIZATION: Enhanced scroll handler with velocity tracking and performance monitoring
  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const frameStartTime = performance.now();
    const currentScrollTop = e.currentTarget.scrollTop;
    const currentTime = Date.now();

    // Calculate scroll velocity
    const timeDelta = currentTime - lastScrollTime.current;
    const scrollDelta = currentScrollTop - lastScrollTop.current;
    const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

    // Update scroll state
    setScrollTop(currentScrollTop);
    setScrollVelocity(velocity);
    setIsScrolling(true);

    // Clear existing scroll timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    // Set new timeout to detect scroll end
    scrollTimeout.current = setTimeout(() => {
      setIsScrolling(false);
      setScrollVelocity(0);
    }, 150); // 150ms after last scroll event

    // Track performance metrics
    const frameEndTime = performance.now();
    const frameTime = frameEndTime - frameStartTime;

    adaptiveBufferCalculator.trackScrollingMetrics({
      frameTime,
      scrollVelocity: velocity,
      scrollTop: currentScrollTop,
      isScrolling: true,
      bufferSize: bufferSize,
      visibleItems: Math.ceil(containerHeight / ITEM_HEIGHT),
      totalItems: filteredEntries.length,
    });

    // Update refs for next calculation
    lastScrollTime.current = currentTime;
    lastScrollTop.current = currentScrollTop;
  };

  const scrollToTop = (): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = (): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: totalHeight, behavior: 'smooth' });
    }
  };

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

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader size={24} className="animate-spin" />
        <span>Loading dictionary...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Search bar and controls */}
      <div className={styles.searchBar}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search entries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        <div className={styles.scrollControls}>
          <button
            onClick={scrollToTop}
            className={`icon ${styles.scrollButton}`}
            title="Scroll to top"
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={scrollToBottom}
            className={`icon ${styles.scrollButton}`}
            title="Scroll to bottom"
          >
            <ChevronsDown size={16} />
          </button>
        </div>
      </div>

      {/* Entry count indicator */}
      <div className={styles.entryCountBar}>
        Showing {visibleEntries.length} of {filteredEntries.length} entries
        {/* OPTIMIZATION: Adaptive buffer debug info (always visible for testing) */}
        <span className={styles.entryCount}>
          • Buffer: {bufferSize} • Velocity: {Math.abs(scrollVelocity).toFixed(1)}px/ms
          {isScrolling && ' • Scrolling'}
        </span>
      </div>

      {/* Error display */}
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

      {/* Virtualized table container */}
      <div ref={tableContainerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Table header (fixed) */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--background-color)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div style={{ width: '40%', padding: '0.5rem 0.75rem', fontWeight: 'bold' }}>
            Source Text
          </div>
          <div style={{ width: '40%', padding: '0.5rem 0.75rem', fontWeight: 'bold' }}>
            Translation
          </div>
          <div
            style={{
              width: '20%',
              padding: '0.5rem 0.75rem',
              fontWeight: 'bold',
              textAlign: 'right',
            }}
          >
            Actions
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: containerHeight - 100, // Account for header and controls
            overflow: 'auto',
            position: 'relative',
          }}
        >
          {/* Virtual spacer for total height */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            {/* Visible entries container */}
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleEntries.map(
                ([source, translation]: [string, DictionaryEntryValue], index: number) => {
                  const actualIndex = startIndex + index;
                  const translationText =
                    typeof translation === 'string' ? translation : translation.translation;
                  const allowAsPatternVariable =
                    typeof translation === 'object' &&
                    translation !== null &&
                    'allowAsPatternVariable' in translation &&
                    translation.allowAsPatternVariable === true;
                  const lowPriority =
                    typeof translation === 'object' &&
                    translation !== null &&
                    'lowPriority' in translation &&
                    translation.lowPriority === true;

                  return (
                    <div
                      key={`${source}-${actualIndex}`}
                      style={{
                        height: ITEM_HEIGHT,
                        display: 'flex',
                        alignItems: 'center',
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor:
                          actualIndex % 2 === 0 ? 'var(--background-color)' : 'var(--secondary-bg)',
                      }}
                    >
                      <div
                        style={{
                          width: '40%',
                          padding: '0.25rem 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {source}
                      </div>
                      <div
                        style={{
                          width: '40%',
                          padding: '0.25rem 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {translationText}
                        {allowAsPatternVariable && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.8em',
                              color: 'var(--accent-color)',
                              fontWeight: 'bold',
                            }}
                          >
                            [X]
                          </span>
                        )}
                        {lowPriority && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.8em',
                              color: '#ff8c00',
                              fontWeight: 'bold',
                            }}
                          >
                            [LP]
                          </span>
                        )}
                      </div>
                      <div style={{ width: '20%', padding: '0.25rem 0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() =>
                            setEditingEntry({
                              source,
                              translation: translationText,
                              allowAsPatternVariable,
                              lowPriority,
                            })
                          }
                          className="icon"
                          disabled={isDeleting}
                          title="Edit entry"
                          style={{ marginRight: '0.25rem' }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setMoveEntry({ source, translation: translationText })}
                          className="icon"
                          disabled={isDeleting}
                          title="Move to another dictionary"
                          style={{ marginRight: '0.25rem' }}
                        >
                          <MoveIcon size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(source)}
                          className={`icon ${showConfirmDelete === source ? 'danger' : ''}`}
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
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal dialogs */}
      {editingEntry &&
        React.createElement(DictionaryEntry as any, {
          entry: editingEntry,
          onClose: () => setEditingEntry(null),
          selectedDictionary: selectedDictionary,
        })}

      {moveEntry &&
        React.createElement(MoveEntryDialog as any, {
          entry: moveEntry,
          currentDictionary: selectedDictionary,
          onClose: () => setMoveEntry(null),
        })}
    </div>
  );
};

export default VirtualizedDictionaryTable;

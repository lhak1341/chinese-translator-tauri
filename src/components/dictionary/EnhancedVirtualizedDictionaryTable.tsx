import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Edit2,
  Trash2,
  AlertCircle,
  Loader,
  // MoveIcon,
  ChevronsUp,
  ChevronsDown,
} from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes } from './DictionaryTypes';
import DictionaryEntry from './DictionaryEntry';
import MoveEntryDialog from './MoveEntryDialog';
import { adaptiveBufferCalculator } from '../../utils/AdaptiveVirtualScrolling.js';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { logger } from '../../utils/logger';
import { createDuplicateKey, parseDuplicateKey } from '../../utils/DuplicateAnalyzer';
import { toast } from '../ToastContext';

/**
 * Props for BulkMoveDialog extracted component
 */
interface BulkMoveDialogProps {
  selectedDictionary: string;
  selectedEntries: Set<string>;
  isMoving: boolean;
  onSetMoving: (moving: boolean) => void;
  onClose: () => void;
  onMoveSuccess: () => void;
}

/**
 * Bulk Move Dialog — extracted to module scope to avoid re-creating
 * a component type (with hooks) on every parent render.
 */
const BulkMoveDialog: React.FC<BulkMoveDialogProps> = ({
  selectedDictionary,
  selectedEntries,
  isMoving,
  onSetMoving,
  onClose,
  onMoveSuccess,
}) => {
  const { loadDictionary, dictionaries } = useDictionary();
  const [selectedTargetDict, setSelectedTargetDict] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [availableDictionaries, setAvailableDictionaries] = useState<string[]>([]);

  // Load fresh dictionary list on mount to pick up renamed dictionaries
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();
        const dictionaryList = Object.keys(types)
          .filter((id) => id !== selectedDictionary)
          .sort((a, b) => {
            // Always put 'properNouns' first
            if (a === 'properNouns') return -1;
            if (b === 'properNouns') return 1;
            // Sort custom dictionaries alphabetically
            return a.localeCompare(b);
          });
        setAvailableDictionaries(dictionaryList);
      } catch (error) {
        logger.error('Failed to load dictionaries:', error);
        setError('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [selectedDictionary]);

  const handleBulkMoveExecute = async (): Promise<void> => {
    if (!selectedTargetDict) {
      setError('Please select a target dictionary');
      return;
    }

    onSetMoving(true);
    setError(null);

    try {
      const entriesToMove = Array.from(selectedEntries);

      // Memory-optimized: use dictionaries already loaded in context
      // instead of loading full dictionaries from backend
      const sourceDict = dictionaries[selectedDictionary];
      const targetDict = dictionaries[selectedTargetDict];

      if (!sourceDict) {
        throw new Error('Source dictionary not loaded');
      }
      if (!targetDict) {
        throw new Error('Target dictionary not loaded');
      }

      // Build minimal update objects with only the entries being moved
      // CODE REVIEW FIX 2026-02-08 (LOW): Use proper type instead of unknown
      const entriesToAdd: Record<string, DictionaryEntryValue> = {};
      const entriesToRemove: string[] = [];

      for (const source of entriesToMove) {
        const value = sourceDict[source];
        if (value !== undefined) {
          entriesToAdd[source] = value;
          entriesToRemove.push(source);
        }
      }

      // Apply changes to target dictionary (add entries)
      const updatedTargetDict = { ...targetDict, ...entriesToAdd };

      // Apply changes to source dictionary (remove entries)
      const updatedSourceDict = { ...sourceDict };
      for (const source of entriesToRemove) {
        delete updatedSourceDict[source];
      }

      // Save both dictionaries with optimized payload
      const [saveTargetResult, saveSourceResult] = await Promise.all([
        window.electronAPI.saveDictionary(selectedTargetDict, updatedTargetDict),
        window.electronAPI.saveDictionary(selectedDictionary, updatedSourceDict),
      ]);

      if (!saveTargetResult.success) {
        throw new Error(`Failed to save target dictionary: ${saveTargetResult.error}`);
      }
      if (!saveSourceResult.success) {
        throw new Error(`Failed to save source dictionary: ${saveSourceResult.error}`);
      }

      // Reload dictionaries to update UI state
      await loadDictionary(selectedDictionary);
      await loadDictionary(selectedTargetDict);

      onMoveSuccess();
    } catch (error) {
      setError(`Failed to move entries: ${(error as Error).message}`);
      logger.error('Bulk move error:', error);
    } finally {
      onSetMoving(false);
    }
  };

  // Get dictionary label for display
  const getSourceDictLabel = (): string => {
    if (selectedDictionary === 'properNouns') {
      return 'Proper Nouns (Base)';
    } else if (selectedDictionary.startsWith('properNouns-')) {
      return `Proper Nouns - ${selectedDictionary.replace('properNouns-', '')}`;
    } else {
      return selectedDictionary.charAt(0).toUpperCase() + selectedDictionary.slice(1);
    }
  };

  // Get preview entries (first 3)
  const previewEntries = Array.from(selectedEntries).slice(0, 3);
  const hasMore = selectedEntries.size > 3;
  const currentDict = dictionaries[selectedDictionary];

  return (
    <div className={styles.bulkMoveOverlay} onClick={onClose}>
      <div className={styles.bulkMoveModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.bulkMoveHeader}>
          <h2 className={styles.bulkMoveTitle}>
            Move {selectedEntries.size} {selectedEntries.size === 1 ? 'Entry' : 'Entries'}
          </h2>
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
            <div className={styles.bulkMoveReadOnlyField}>{getSourceDictLabel()}</div>
          </div>

          {/* Destination Dictionary */}
          <div className={styles.bulkMoveFormGroup}>
            <label className={styles.bulkMoveLabel}>To:</label>
            <select
              value={selectedTargetDict}
              onChange={(e) => setSelectedTargetDict(e.target.value)}
              disabled={isMoving}
              className={`${styles.bulkMoveSelect} ${error ? styles.bulkMoveSelectWithError : ''}`}
              autoFocus
            >
              <option value="">Choose destination dictionary...</option>
              {availableDictionaries.map((id) => (
                <option key={id} value={id}>
                  {id === 'properNouns'
                    ? 'Proper Nouns (Base)'
                    : id.startsWith('properNouns-')
                      ? `Proper Nouns - ${id.replace('properNouns-', '')}`
                      : id.charAt(0).toUpperCase() + id.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {error && <div className={styles.bulkMoveError}>{error}</div>}
        </div>

        <div className={styles.bulkMoveActions}>
          <button onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button
            onClick={handleBulkMoveExecute}
            className="primary"
            disabled={isMoving || !selectedTargetDict}
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
 * Entry data for editing modal
 */
interface EditingEntryData {
  source: string;
  translation: string;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

/**
 * Entry data for move dialog
 */
interface MoveEntryData {
  source: string;
  translation: string;
}

/**
 * Selection state passed to parent component
 */
interface SelectionState {
  selectedEntries: Set<string>;
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  isDeleting: boolean;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (show: boolean) => void;
  onBulkMove?: () => void;
  isMoving?: boolean;
}

/**
 * Context menu state
 */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: { source: string; translation: string } | null;
}

/**
 * Props for EnhancedVirtualizedDictionaryTable component
 */
interface EnhancedVirtualizedDictionaryTableProps {
  /** Currently selected dictionary ID */
  selectedDictionary: string;
  /** Optional ref for search input (for keyboard shortcut focus) */
  searchRef?: React.RefObject<HTMLInputElement>;
  /** Callback when selection state changes */
  onSelectionChange?: (state: SelectionState) => void;
  /** Whether the parent tab is active (for remeasuring on visibility) */
  isActive?: boolean;
  /** Whether to show duplicate mode (4-column layout) */
  showDuplicatesMode?: boolean;
  /** Duplicate rows to display when in duplicate mode */
  duplicateRows?: import('../../utils/DuplicateAnalyzer').DuplicateRow[];
  /** Callback to refresh duplicate view after deletion */
  onRefreshDuplicates?: (reloadFromBackend?: boolean) => Promise<void>;
  /** Scroll position to restore (managed by parent to survive unmount/remount) */
  scrollRestore?: number | null;
  /** Callback to save scroll position before refresh (pass null to clear) */
  onScrollSave?: (position: number | null) => void;
}

// Optimized constants for better performance
const ITEM_HEIGHT = 40; // Height of each table row in pixels
// OPTIMIZATION: Dynamic buffer sizing replaced fixed BUFFER_SIZE = 10
// Now calculated based on device performance, viewport, and memory pressure
const _SCROLL_THROTTLE_MS = 16; // 60fps throttling for scroll events
const SEARCH_DEBOUNCE_MS = 150; // Debounce search input
const LARGE_LIST_THRESHOLD = 1000; // When to apply additional optimizations

/**
 * Helper function to highlight pattern variables (X, Y, Z, etc.) in source text
 * Each variable gets a different color for clarity
 */
const highlightPatternVariables = (text: string): React.ReactNode => {
  // Pattern variables are single uppercase letters (X, Y, Z, A, B, C, etc.)
  const parts = text.split(/([A-Z])/);

  // Color palette for different variables
  const variableColors: Record<string, string> = {
    X: '#dc2626', // red-600
    Y: '#16a34a', // green-600
    Z: '#0891b2', // cyan-600
    A: '#ea580c', // orange-600
    B: '#7c3aed', // violet-600
    C: '#0d9488', // teal-600
    D: '#db2777', // pink-600
    E: '#2563eb', // blue-600
  };

  return parts.map((part, index) => {
    // Check if this is a single uppercase letter
    if (part.length === 1 && /[A-Z]/.test(part)) {
      const color = variableColors[part] || '#059669'; // Default to green if not in palette
      return (
        <span key={index} className={styles.patternVariable} style={{ color: color }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

/**
 * Clickable badge component for metadata (Variable, Low Priority)
 */
interface BadgeProps {
  type: 'variable' | 'lowPriority';
  active: boolean;
  onClick: () => void;
}

const MetadataBadge: React.FC<BadgeProps> = ({ type, active, onClick }) => {
  const config =
    type === 'variable'
      ? {
          label: 'VAR',
          title: active ? 'Click to disallow as variable' : 'Click to allow as variable',
          activeColor: '#059669',
          inactiveColor: '#6b7280',
        }
      : {
          label: 'LP',
          title: active ? 'Click to remove low priority' : 'Click to set low priority',
          activeColor: '#dc2626',
          inactiveColor: '#6b7280',
        };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation(); // Prevent triggering translation edit
        onClick();
      }}
      title={config.title}
      className={styles.metadataBadge}
      style={{
        background: active ? config.activeColor : 'transparent',
        color: active ? 'white' : config.inactiveColor,
        border: active ? 'none' : `1px solid ${config.inactiveColor}`,
      }}
    >
      {active && (type === 'variable' ? '✓ ' : '⬇ ')}
      {config.label}
    </span>
  );
};

/**
 * Enhanced Virtualized Dictionary Table
 * Optimized for handling 10,000+ dictionary entries with smooth performance
 *
 * Key optimizations:
 * - Throttled scroll events for 60fps performance
 * - Debounced search for reduced computation
 * - Memoized row rendering with React.memo
 * - Optimized filtering with early termination
 * - Dynamic buffer sizing based on list size
 * - Intersection Observer for visibility detection
 *
 * @param props - Component props
 * @returns Enhanced virtualized dictionary table with inline editing
 */
const EnhancedVirtualizedDictionaryTable: React.FC<EnhancedVirtualizedDictionaryTableProps> = ({
  selectedDictionary,
  searchRef,
  onSelectionChange,
  isActive,
  showDuplicatesMode = false,
  duplicateRows = [],
  onRefreshDuplicates,
  scrollRestore,
  onScrollSave,
}) => {
  const { dictionaries, deleteEntry, bulkDeleteEntries, updateEntry, isLoading } = useDictionary();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState<boolean>(false);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [preservedScrollTop, setPreservedScrollTop] = useState<number | null>(null);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);

  // OPTIMIZATION: Adaptive buffer sizing state
  const [bufferSize, setBufferSize] = useState<number>(10); // Start with default, will be optimized
  const [scrollVelocity, setScrollVelocity] = useState<number>(0);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTop = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());

  // Reset states when dictionary changes
  useEffect(() => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setEditingEntry(null);
    setMoveEntry(null);
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
    setScrollTop(0);
    lastScrollTop.current = 0;
  }, [selectedDictionary]);

  // Clear selections when switching between duplicate and normal modes
  // BUGFIX: Prevents composite keys from persisting when exiting duplicate mode
  useEffect(() => {
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
  }, [showDuplicatesMode]);

  // Debounced search term
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchTerm]);

  // Remeasure container height when tab becomes active (fixes virtualization on tab switch)
  useEffect(() => {
    if (isActive && scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has fully rendered
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const height = scrollRef.current.clientHeight;
          if (height > 0) {
            setContainerHeight(height);
          }
        }
      });
    }
  }, [isActive]);

  // Track ResizeObserver instance for cleanup
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Callback ref to set up ResizeObserver when scroll element is ready
  const scrollRefCallback = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    // Store ref for other code that uses scrollRef.current
    scrollRef.current = node;

    if (node) {
      // Set up ResizeObserver to measure viewport height
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const height = entry.contentRect.height;
          setContainerHeight(height);
        }
      });

      resizeObserver.observe(node);
      resizeObserverRef.current = resizeObserver;
    }
  }, []);

  // Optimized filtered entries with early termination for large datasets
  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    // In duplicate mode, return empty array (use filteredDuplicateRows instead)
    if (showDuplicatesMode) {
      return [];
    }

    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    const entries = Object.entries(dictionary) as [string, DictionaryEntryValue][];

    if (!debouncedSearchTerm) return entries;

    const searchLower = debouncedSearchTerm.toLowerCase();
    return entries.filter(([source, translation]) => {
      const translationText =
        typeof translation === 'string' ? translation : translation.translation;
      return (
        source.toLowerCase().includes(searchLower) ||
        translationText.toLowerCase().includes(searchLower)
      );
    });
  }, [dictionaries, selectedDictionary, debouncedSearchTerm, showDuplicatesMode]);

  // Filtered duplicate rows for duplicate mode
  const filteredDuplicateRows = useMemo(() => {
    if (!showDuplicatesMode) return [];

    if (!debouncedSearchTerm) return duplicateRows;

    const searchLower = debouncedSearchTerm.toLowerCase();
    return duplicateRows.filter((row) => {
      return (
        row.source.toLowerCase().includes(searchLower) ||
        row.translation.toLowerCase().includes(searchLower) ||
        row.dictionaryLabel.toLowerCase().includes(searchLower)
      );
    });
  }, [duplicateRows, debouncedSearchTerm, showDuplicatesMode]);

  // Pre-calculate group indices for alternating backgrounds (memoized for performance)
  const duplicateGroupIndices = useMemo(() => {
    if (!showDuplicatesMode || filteredDuplicateRows.length === 0) return [];

    const indices: number[] = [];
    let groupIndex = 0;
    let lastSource = '';

    for (const row of filteredDuplicateRows) {
      if (row.source !== lastSource) {
        if (lastSource !== '') groupIndex++;
        lastSource = row.source;
      }
      indices.push(groupIndex);
    }

    return indices;
  }, [filteredDuplicateRows, showDuplicatesMode]);

  // Dynamic buffer sizing based on list size
  // OPTIMIZATION: Adaptive buffer size calculation
  useEffect(() => {
    const calculateOptimalBuffer = async () => {
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
        logger.warn('Buffer size calculation failed:', error);
        // Keep current buffer size on error
      }
    };

    // Calculate on significant changes
    const debounceTimer = setTimeout(calculateOptimalBuffer, 100);
    return () => clearTimeout(debounceTimer);
  }, [
    containerHeight,
    filteredEntries.length,
    filteredDuplicateRows.length,
    scrollVelocity,
    isScrolling,
    bufferSize,
  ]);

  // Optimized visible range calculation with adaptive buffer
  const visibleRange = useMemo(() => {
    const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - bufferSize);
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + bufferSize * 2);

    return { startIndex, endIndex, visibleCount };
  }, [
    scrollTop,
    containerHeight,
    filteredEntries.length,
    filteredDuplicateRows.length,
    showDuplicatesMode,
    bufferSize,
  ]);

  const { startIndex, endIndex } = visibleRange;

  // Use different data source based on mode
  const visibleEntries = showDuplicatesMode
    ? [] // Not used in duplicate mode
    : filteredEntries.slice(startIndex, endIndex);

  const visibleDuplicateRows = showDuplicatesMode
    ? filteredDuplicateRows.slice(startIndex, endIndex)
    : [];

  // Calculate virtual scrolling properties based on mode
  const totalHeight = showDuplicatesMode
    ? filteredDuplicateRows.length * ITEM_HEIGHT
    : filteredEntries.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;

  // OPTIMIZATION: Enhanced scroll handler with velocity tracking and performance monitoring
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      const frameStartTime = performance.now();
      const newScrollTop = e.currentTarget.scrollTop;
      const currentTime = Date.now();

      // Only update if scroll position changed significantly (reduce re-renders)
      if (Math.abs(newScrollTop - lastScrollTop.current) < 5) {
        return;
      }

      // Calculate scroll velocity
      const timeDelta = currentTime - lastScrollTime.current;
      const scrollDelta = newScrollTop - lastScrollTop.current;
      const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

      // Update scroll state
      lastScrollTop.current = newScrollTop;
      setScrollTop(newScrollTop);
      setScrollVelocity(velocity);
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set scrolling to false after scroll ends
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        setScrollVelocity(0);
      }, 150);

      // Track performance metrics
      const frameEndTime = performance.now();
      const frameTime = frameEndTime - frameStartTime;

      adaptiveBufferCalculator.trackScrollingMetrics({
        frameTime,
        scrollVelocity: velocity,
        scrollTop: newScrollTop,
        isScrolling: true,
        bufferSize: bufferSize,
        visibleItems: Math.ceil(containerHeight / ITEM_HEIGHT),
        totalItems: filteredEntries.length,
      });

      // Update refs for next calculation
      lastScrollTime.current = currentTime;
    },
    [bufferSize, containerHeight, filteredEntries.length]
  );

  // Optimized scroll utilities
  const scrollToTop = useCallback((): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const scrollToBottom = useCallback((): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: totalHeight,
        behavior: 'smooth',
      });
    }
  }, [totalHeight]);

  // Forward search input ref
  useEffect(() => {
    if (searchRef && searchRef.current) {
      // Focus search when requested
    }
  }, [searchRef]);

  // Wrapped updateEntry function that preserves scroll position
  const updateEntryWithScrollPreservation = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata?: any
    ): Promise<void> => {
      // Capture scroll position before update
      // BUGFIX: Use scrollRef.current directly to avoid infinite loop
      // scrollTop in deps would cause callback recreation on every scroll → cascade of updates
      const currentScrollTop = scrollRef.current?.scrollTop ?? 0;
      setPreservedScrollTop(currentScrollTop);
      setIsUpdating(true);

      try {
        await updateEntry(dictionaryId, oldSource, newSource, translation, metadata);
      } finally {
        setIsUpdating(false);
      }
    },
    [updateEntry]
  );

  // Restore scroll position after dictionary updates
  useEffect(() => {
    if (!isUpdating && preservedScrollTop !== null && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = preservedScrollTop;
          setScrollTop(preservedScrollTop);
        }
        setPreservedScrollTop(null);
      });
    }
  }, [isUpdating, preservedScrollTop]);

  // Restore scroll position after duplicate rows refresh
  useEffect(() => {
    if (
      scrollRestore !== null &&
      scrollRestore !== undefined &&
      scrollRef.current &&
      onScrollSave
    ) {
      const position = scrollRestore;
      // Use delay to ensure virtualized list has fully re-rendered
      setTimeout(() => {
        if (scrollRef.current && onScrollSave) {
          scrollRef.current.scrollTop = position;
          setScrollTop(position);
          onScrollSave(null); // Clear the restore position
        }
      }, 300);
    }
  }, [scrollRestore, onScrollSave]);

  // Selection handlers with scroll preservation
  const handleSelectEntry = useCallback((source: string, isSelected: boolean): void => {
    // Capture scroll position before selection state change
    // BUGFIX: Use scrollRef.current directly to avoid infinite loop
    const currentScrollTop = scrollRef.current?.scrollTop ?? 0;

    setSelectedEntries((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(source);
      } else {
        newSet.delete(source);
      }
      return newSet;
    });

    // Restore scroll position after state update
    requestAnimationFrame(() => {
      if (scrollRef.current && scrollRef.current.scrollTop !== currentScrollTop) {
        scrollRef.current.scrollTop = currentScrollTop;
        setScrollTop(currentScrollTop);
      }
    });
  }, []);

  const handleSelectAll = useCallback(
    (isSelected: boolean): void => {
      // Capture scroll position before bulk selection change
      // BUGFIX: Use scrollRef.current directly to avoid infinite loop
      const currentScrollTop = scrollRef.current?.scrollTop ?? 0;

      if (isSelected) {
        const allSources = filteredEntries.map(([source]) => source);
        setSelectedEntries(new Set(allSources));
      } else {
        setSelectedEntries(new Set());
      }

      // Restore scroll position after state update
      requestAnimationFrame(() => {
        if (scrollRef.current && scrollRef.current.scrollTop !== currentScrollTop) {
          scrollRef.current.scrollTop = currentScrollTop;
          setScrollTop(currentScrollTop);
        }
      });
    },
    [filteredEntries]
  );

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selectedEntries.size === 0) return;

    setIsDeleting(true);

    const errors: string[] = [];
    let successCount = 0;

    try {
      if (showDuplicatesMode) {
        // Duplicate mode: selectedEntries contains composite keys (source::dictionaryId)
        // Group deletions by dictionary, handling malformed keys gracefully
        const deletionsByDict = new Map<string, string[]>();

        // Parse all keys first, collecting errors
        for (const key of selectedEntries) {
          try {
            const { source, dictionaryId } = parseDuplicateKey(key);
            if (!deletionsByDict.has(dictionaryId)) {
              deletionsByDict.set(dictionaryId, []);
            }
            deletionsByDict.get(dictionaryId)!.push(source);
          } catch (parseError) {
            errors.push(`Invalid key format: ${key}`);
            logger.error('Key parsing error:', parseError);
          }
        }

        // Delete from each dictionary using bulkDeleteEntries (more efficient - one save per dictionary)
        for (const [dictionaryId, sources] of deletionsByDict) {
          try {
            const result = await bulkDeleteEntries(dictionaryId, sources);
            successCount += result.successCount;
            errors.push(...result.errors);
          } catch (deleteError) {
            const errorMsg = `Failed to delete entries from ${dictionaryId}: ${(deleteError as Error).message}`;
            errors.push(errorMsg);
            logger.error('Bulk delete error:', deleteError);
          }
        }
      } else {
        // Normal mode: selectedEntries contains source strings, all from same dictionary
        const entriesToDelete = Array.from(selectedEntries);
        try {
          const result = await bulkDeleteEntries(selectedDictionary, entriesToDelete);
          successCount = result.successCount;
          errors.push(...result.errors);
        } catch (deleteError) {
          errors.push(`Failed to delete entries: ${(deleteError as Error).message}`);
          logger.error('Bulk delete error:', deleteError);
        }
      }

      // Report results to user using toast
      if (errors.length > 0) {
        if (successCount > 0) {
          // Partial success
          toast.warning(
            `Deleted ${successCount} of ${selectedEntries.size} entries. ${errors.length} failed.`,
            6000
          );
        } else {
          // All failed
          toast.error(
            `Failed to delete ${selectedEntries.size} ${selectedEntries.size === 1 ? 'entry' : 'entries'}.`,
            6000
          );
        }
      } else {
        // All succeeded
        toast.success(
          `Deleted ${successCount} ${successCount === 1 ? 'entry' : 'entries'} successfully`,
          3000
        );
        setSelectedEntries(new Set());
        setShowBulkDeleteConfirm(false);
      }

      // Refresh duplicate view if in duplicate mode (to show updated state)
      if (showDuplicatesMode && onRefreshDuplicates && onScrollSave) {
        // Save scroll position for restoration after duplicateRows updates
        const currentScroll = scrollRef.current?.scrollTop ?? 0;
        await onRefreshDuplicates();
        onScrollSave(currentScroll);
      }
    } catch (error) {
      toast.error(`Critical error during deletion: ${(error as Error).message}`, 6000);
      logger.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [
    selectedEntries,
    selectedDictionary,
    deleteEntry,
    bulkDeleteEntries,
    showDuplicatesMode,
    onRefreshDuplicates,
  ]);

  const handleBulkMove = useCallback((): void => {
    if (selectedEntries.size === 0) return;
    setShowBulkMoveDialog(true);
  }, [selectedEntries]);

  // Notify parent about selection changes — placed after handleBulkDelete /
  // handleBulkMove so the dep array can reference their stable useCallback values.
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedEntries,
        selectedCount: selectedEntries.size,
        onBulkDelete: handleBulkDelete,
        isDeleting,
        showBulkDeleteConfirm,
        setShowBulkDeleteConfirm,
        onBulkMove: handleBulkMove,
        isMoving,
      });
    }
  }, [
    selectedEntries,
    isDeleting,
    showBulkDeleteConfirm,
    isMoving,
    onSelectionChange,
    handleBulkDelete,
    handleBulkMove,
  ]);

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, source: string, translation: string): void => {
      e.preventDefault();
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        entry: { source, translation },
      });
    },
    []
  );

  const closeContextMenu = useCallback((): void => {
    setContextMenu({ visible: false, x: 0, y: 0, entry: null });
  }, []);

  const handleContextMenuEdit = (): void => {
    if (!contextMenu.entry) return;
    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return;

    const value = dictionary[contextMenu.entry.source];
    setEditingEntry({
      source: contextMenu.entry.source,
      translation: typeof value === 'string' ? value : value.translation,
      allowAsPatternVariable:
        typeof value === 'object' && value.allowAsPatternVariable ? true : false,
      lowPriority: typeof value === 'object' && value.lowPriority ? true : false,
    });
    closeContextMenu();
  };

  const handleContextMenuMove = (): void => {
    if (!contextMenu.entry) return;
    setMoveEntry(contextMenu.entry);
    closeContextMenu();
  };

  const handleContextMenuDelete = async (): Promise<void> => {
    if (!contextMenu.entry) return;
    try {
      await deleteEntry(selectedDictionary, contextMenu.entry.source);
      closeContextMenu();
    } catch (error) {
      toast.error(`Failed to delete entry: ${(error as Error).message}`, 6000);
      closeContextMenu();
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenu.visible) {
      const handleClickOutside = () => closeContextMenu();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  }, [contextMenu.visible, closeContextMenu]);

  // Optimized row component with React.memo
  const VirtualRow = useMemo(() => {
    interface VirtualRowProps {
      source: string;
      translation: DictionaryEntryValue;
      _index: number;
      actualIndex: number;
      isScrolling: boolean;
      isSelected: boolean;
    }

    const VirtualRowComponent = React.memo<VirtualRowProps>(
      ({ source, translation, _index, actualIndex, isScrolling, isSelected }) => {
        const translationText =
          typeof translation === 'string' ? translation : translation.translation;
        const allowAsPatternVariable =
          typeof translation === 'object' && translation.allowAsPatternVariable === true;
        const lowPriority = typeof translation === 'object' && translation.lowPriority === true;

        // State for inline editing
        const [editingSource, setEditingSource] = React.useState(false);
        const [editingTranslation, setEditingTranslation] = React.useState(false);
        const [tempSource, setTempSource] = React.useState(source);
        const [tempTranslation, setTempTranslation] = React.useState(translationText);

        // Update temp values when props change (after save)
        React.useEffect(() => {
          if (!editingSource) setTempSource(source);
        }, [source, editingSource]);

        React.useEffect(() => {
          if (!editingTranslation) setTempTranslation(translationText);
        }, [translationText, editingTranslation]);

        // Handle checkbox changes for patterns - preserve scroll position
        const handleCheckboxChange = async (field: string, value: boolean): Promise<void> => {
          try {
            const metadata: any = { allowAsPatternVariable, lowPriority };
            metadata[field] = value;

            // Use scroll-preserving update function
            await updateEntryWithScrollPreservation(
              selectedDictionary,
              source,
              source,
              translationText,
              metadata
            );
          } catch (error) {
            logger.error(`Failed to update ${field}:`, error);
          }
        };

        // Handle text field changes
        const handleTextSave = async (field: 'source' | 'translation'): Promise<void> => {
          try {
            // Only pass metadata for dictionaries that support it
            const metadata =
              selectedDictionary === 'patterns' || selectedDictionary === 'phrases'
                ? { allowAsPatternVariable, lowPriority }
                : {};

            if (field === 'source') {
              if (tempSource !== source && tempSource.trim()) {
                await updateEntryWithScrollPreservation(
                  selectedDictionary,
                  source,
                  tempSource.trim(),
                  translationText,
                  metadata
                );
              }
              setEditingSource(false);
            } else if (field === 'translation') {
              if (tempTranslation !== translationText && tempTranslation.trim()) {
                await updateEntryWithScrollPreservation(
                  selectedDictionary,
                  source,
                  source,
                  tempTranslation.trim(),
                  metadata
                );
              }
              setEditingTranslation(false);
            }
          } catch (error) {
            logger.error(`Failed to update ${field}:`, error);
            // Reset to original value on error
            if (field === 'source') {
              setTempSource(source);
              setEditingSource(false);
            } else {
              setTempTranslation(translationText);
              setEditingTranslation(false);
            }
          }
        };

        // Handle text field cancellation
        const handleTextCancel = (field: 'source' | 'translation'): void => {
          if (field === 'source') {
            setTempSource(source);
            setEditingSource(false);
          } else {
            setTempTranslation(translationText);
            setEditingTranslation(false);
          }
        };

        // Handle keyboard events for text editing
        const handleKeyDown = (
          e: React.KeyboardEvent<HTMLInputElement>,
          field: 'source' | 'translation'
        ): void => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleTextSave(field);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleTextCancel(field);
          }
        };

        // Render 5-column layout for patterns (with selection checkbox)
        if (selectedDictionary === 'patterns') {
          return (
            <div
              onContextMenu={(e) => handleContextMenu(e, source, translationText)}
              style={{
                height: ITEM_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: isSelected
                  ? 'rgba(16, 185, 129, 0.18)'
                  : actualIndex % 2 === 0
                    ? 'var(--background-color)'
                    : 'var(--secondary-bg)',
                willChange: isScrolling ? 'transform' : 'auto',
              }}
            >
              {/* Selection Checkbox - 40px */}
              <div className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleSelectEntry(source, e.target.checked)}
                  className={styles.checkboxInput}
                  title="Select for deletion"
                />
              </div>

              {/* Source Text - calc(35% - 20px) with variable highlighting */}
              <div className={styles.cell} style={{ width: 'calc(35% - 20px)' }}>
                {editingSource ? (
                  <input
                    type="text"
                    value={tempSource}
                    onChange={(e) => setTempSource(e.target.value)}
                    onBlur={() => handleTextSave('source')}
                    onKeyDown={(e) => handleKeyDown(e, 'source')}
                    autoFocus
                    className={styles.inlineEditInput}
                  />
                ) : (
                  <span
                    onClick={() => setEditingSource(true)}
                    className={styles.clickableText}
                    title="Click to edit"
                  >
                    {highlightPatternVariables(source)}
                  </span>
                )}
              </div>

              {/* Translation - calc(65% - 20px) with metadata badges */}
              <div className={styles.cellEditable} style={{ width: 'calc(65% - 20px)' }}>
                {editingTranslation ? (
                  <input
                    type="text"
                    value={tempTranslation}
                    onChange={(e) => setTempTranslation(e.target.value)}
                    onBlur={() => handleTextSave('translation')}
                    onKeyDown={(e) => handleKeyDown(e, 'translation')}
                    autoFocus
                    className={styles.inlineEditInput}
                  />
                ) : (
                  <>
                    <span
                      onClick={() => setEditingTranslation(true)}
                      className={styles.clickableText}
                      title="Click to edit"
                    >
                      {highlightPatternVariables(translationText)}
                    </span>
                    <div className={styles.badgeContainer}>
                      <MetadataBadge
                        type="variable"
                        active={allowAsPatternVariable}
                        onClick={() =>
                          handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                        }
                      />
                      <MetadataBadge
                        type="lowPriority"
                        active={lowPriority}
                        onClick={() => handleCheckboxChange('lowPriority', !lowPriority)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }

        // 3-column layout for phrases (with selection + Variable badge)
        if (selectedDictionary === 'phrases') {
          return (
            <div
              onContextMenu={(e) => handleContextMenu(e, source, translationText)}
              style={{
                height: ITEM_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: isSelected
                  ? 'rgba(16, 185, 129, 0.18)'
                  : actualIndex % 2 === 0
                    ? 'var(--background-color)'
                    : 'var(--secondary-bg)',
                willChange: isScrolling ? 'transform' : 'auto',
              }}
            >
              {/* Selection Checkbox - 40px */}
              <div className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleSelectEntry(source, e.target.checked)}
                  className={styles.checkboxInput}
                  title="Select for deletion"
                />
              </div>

              {/* Source Text - calc(35% - 20px) */}
              <div
                style={{
                  width: 'calc(35% - 20px)',
                  padding: '0.25rem 0.75rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {editingSource ? (
                  <input
                    type="text"
                    value={tempSource}
                    onChange={(e) => setTempSource(e.target.value)}
                    onBlur={() => handleTextSave('source')}
                    onKeyDown={(e) => handleKeyDown(e, 'source')}
                    autoFocus
                    className={styles.inlineEditInput}
                  />
                ) : (
                  <span
                    onClick={() => setEditingSource(true)}
                    className={styles.clickableText}
                    title="Click to edit"
                  >
                    {source}
                  </span>
                )}
              </div>

              {/* Translation - calc(65% - 20px) with metadata badge */}
              <div
                style={{
                  width: 'calc(65% - 20px)',
                  padding: '0.25rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  overflow: 'hidden',
                }}
              >
                {editingTranslation ? (
                  <input
                    type="text"
                    value={tempTranslation}
                    onChange={(e) => setTempTranslation(e.target.value)}
                    onBlur={() => handleTextSave('translation')}
                    onKeyDown={(e) => handleKeyDown(e, 'translation')}
                    autoFocus
                    className={styles.inlineEditInput}
                  />
                ) : (
                  <>
                    <span
                      onClick={() => setEditingTranslation(true)}
                      className={styles.clickableText}
                      title="Click to edit"
                    >
                      {translationText}
                    </span>
                    <div className={styles.badgeContainer}>
                      <MetadataBadge
                        type="variable"
                        active={allowAsPatternVariable}
                        onClick={() =>
                          handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }

        // 3-column layout for simple dictionaries (with selection checkbox)
        return (
          <div
            onContextMenu={(e) => handleContextMenu(e, source, translationText)}
            style={{
              height: ITEM_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: isSelected
                ? 'rgba(16, 185, 129, 0.18)'
                : actualIndex % 2 === 0
                  ? 'var(--background-color)'
                  : 'var(--secondary-bg)',
              willChange: isScrolling ? 'transform' : 'auto',
            }}
          >
            {/* Selection Checkbox - 40px */}
            <div
              style={{
                width: '40px',
                minWidth: '40px',
                maxWidth: '40px',
                padding: '0.25rem 0.75rem',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleSelectEntry(source, e.target.checked)}
                style={{ cursor: 'pointer' }}
                title="Select for deletion"
              />
            </div>

            {/* Source Text - calc(35% - 20px) */}
            <div className={styles.cell} style={{ width: 'calc(35% - 20px)' }}>
              {editingSource ? (
                <input
                  type="text"
                  value={tempSource}
                  onChange={(e) => setTempSource(e.target.value)}
                  onBlur={() => handleTextSave('source')}
                  onKeyDown={(e) => handleKeyDown(e, 'source')}
                  autoFocus
                  style={{
                    width: '100%',
                    border: '1px solid var(--accent-color)',
                    borderRadius: '2px',
                    padding: '2px 4px',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    backgroundColor: 'var(--background-color)',
                    color: 'var(--text-color)',
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditingSource(true)}
                  style={{
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title="Click to edit"
                >
                  {source}
                </span>
              )}
            </div>

            {/* Translation - calc(65% - 20px) */}
            <div className={styles.cell} style={{ width: 'calc(65% - 20px)' }}>
              {editingTranslation ? (
                <input
                  type="text"
                  value={tempTranslation}
                  onChange={(e) => setTempTranslation(e.target.value)}
                  onBlur={() => handleTextSave('translation')}
                  onKeyDown={(e) => handleKeyDown(e, 'translation')}
                  autoFocus
                  style={{
                    width: '100%',
                    border: '1px solid var(--accent-color)',
                    borderRadius: '2px',
                    padding: '2px 4px',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    backgroundColor: 'var(--background-color)',
                    color: 'var(--text-color)',
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditingTranslation(true)}
                  style={{
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title="Click to edit"
                >
                  {translationText}
                </span>
              )}
            </div>
          </div>
        );
      }
    );

    VirtualRowComponent.displayName = 'VirtualRowComponent';

    return VirtualRowComponent;
  }, [
    setEditingEntry,
    selectedDictionary,
    updateEntryWithScrollPreservation,
    handleSelectEntry,
    handleContextMenu,
  ]);

  // Performance monitoring for large lists
  const performanceMetrics = useMemo(() => {
    const listSize = filteredEntries.length;
    const renderedCount = visibleEntries.length;
    const renderRatio = listSize > 0 ? (renderedCount / listSize) * 100 : 0;

    return {
      totalEntries: listSize,
      renderedEntries: renderedCount,
      renderEfficiency: renderRatio.toFixed(1),
      isLargeDataset: listSize > LARGE_LIST_THRESHOLD,
    };
  }, [filteredEntries.length, visibleEntries.length]);

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}
      >
        <Loader className="animate-spin" size={24} />
      </div>
    );
  }

  // Duplicate mode rendering (4-column layout)
  if (showDuplicatesMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Search controls */}
        <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search duplicates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '0.875rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.25rem',
              backgroundColor: 'var(--input-background)',
              color: 'var(--text-color)',
            }}
          />
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--background-color)',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ width: '40px', padding: '0.5rem 0.75rem', textAlign: 'center' }}>☐</div>
            <div style={{ width: '20%', padding: '0.5rem 0.75rem' }}>Source Text</div>
            <div style={{ width: '50%', padding: '0.5rem 0.75rem' }}>Translation</div>
            <div style={{ width: 'calc(30% - 40px)', padding: '0.5rem 0.75rem' }}>Dictionary</div>
          </div>

          {/* Rows */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleDuplicateRows.map((row, index) => {
                  const key = createDuplicateKey(row.source, row.dictionaryId);
                  const isSelected = selectedEntries.has(key);

                  // Get pre-calculated group index for alternating backgrounds
                  const actualIndex = startIndex + index;
                  const groupIndex = duplicateGroupIndices[actualIndex] || 0;

                  // Alternating group background colors
                  // Light mode: slightly darker, Dark mode: slightly lighter
                  // Using opacity-based approach for consistency across themes
                  const groupBgColor =
                    groupIndex % 2 === 0
                      ? 'transparent'
                      : 'color-mix(in srgb, var(--text-color) 4%, transparent)';
                  const backgroundColor = isSelected
                    ? 'var(--accent-light, #e0f2fe)'
                    : groupBgColor;

                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--border-color)',
                        height: `${ITEM_HEIGHT}px`,
                        alignItems: 'center',
                        backgroundColor,
                      }}
                    >
                      <div style={{ width: '40px', padding: '0 0.75rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSet = new Set(selectedEntries);
                            if (isSelected) {
                              newSet.delete(key);
                            } else {
                              newSet.add(key);
                            }
                            setSelectedEntries(newSet);
                          }}
                          style={{ cursor: 'pointer' }}
                          aria-label={`Select ${row.source} from ${row.dictionaryLabel}`}
                        />
                      </div>
                      <div
                        style={{
                          width: '20%',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.source}
                      </div>
                      <div
                        style={{
                          width: '50%',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.translation}
                      </div>
                      <div
                        style={{
                          width: 'calc(30% - 40px)',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary, #6b7280)',
                          fontWeight:
                            row.dictionaryLabel === 'Phrases' ||
                            row.dictionaryLabel === 'Proper Nouns'
                              ? 'bold'
                              : 'normal',
                        }}
                      >
                        {row.dictionaryLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search controls */}
      <div
        style={{
          display: 'flex',
          padding: '1rem',
          gap: '1rem',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <input
          type="text"
          placeholder="Search dictionary entries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          ref={searchRef}
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: 'var(--background-color)',
            color: 'var(--text-color)',
            fontSize: '0.875rem',
          }}
        />
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={scrollToTop}
            className="icon"
            title="Scroll to top"
            style={{ padding: '0.5rem' }}
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={scrollToBottom}
            className="icon"
            title="Scroll to bottom"
            style={{ padding: '0.5rem' }}
          >
            <ChevronsDown size={16} />
          </button>
        </div>
      </div>

      {/* Enhanced entry count indicator with performance metrics */}
      <div
        style={{
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          color: 'var(--muted-text)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          Showing {visibleEntries.length} of {filteredEntries.length} entries
        </span>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            fontSize: '0.75rem',
            color: 'var(--accent-color)',
          }}
        >
          {process.env.NODE_ENV === 'development' && performanceMetrics.isLargeDataset && (
            <span>
              Render efficiency: {performanceMetrics.renderEfficiency}%
              {isScrolling && ' (scrolling)'}
            </span>
          )}
          {/* OPTIMIZATION: Adaptive buffer indicator */}
          {process.env.NODE_ENV === 'development' && (
            <span style={{ color: 'var(--muted-text)' }}>Buffer: {bufferSize} (adaptive)</span>
          )}
        </div>
      </div>

      {/* Empty state when no entries */}
      {filteredEntries.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem',
          }}
        >
          <div
            style={{
              color: 'var(--text-color)',
              opacity: 0.4,
              textAlign: 'center',
              fontSize: '1rem',
              lineHeight: '1.8',
            }}
          >
            {searchTerm ? (
              <>
                <div style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                  No entries matching "{searchTerm}"
                </div>
                <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>Try a different search term</div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                  Dictionary is empty
                </div>
                <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>
                  Add entries using Quick Add
                  <br />
                  shortcuts (Cmd/Ctrl+1-5)
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Enhanced virtualized table container */}
          <div
            ref={tableContainerRef}
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Fixed table header */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--background-color)',
                flexShrink: 0,
                zIndex: 1,
              }}
            >
              {selectedDictionary === 'patterns' ? (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(35% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Pattern with highlighted variables"
                  >
                    Source Text
                  </div>
                  <div
                    style={{
                      width: 'calc(65% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badges (VAR = Allow as variable, LP = Low priority)"
                  >
                    Translation
                  </div>
                </>
              ) : selectedDictionary === 'phrases' ? (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(35% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Source Text
                  </div>
                  <div
                    style={{
                      width: 'calc(65% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badge (VAR = Allow as variable)"
                  >
                    Translation
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(35% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Source Text
                  </div>
                  <div
                    style={{
                      width: 'calc(65% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Translation
                  </div>
                </>
              )}
            </div>

            {/* Scrollable content with enhanced performance */}
            <div
              ref={scrollRefCallback}
              onScroll={handleScroll}
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: '100%',
                overflow: 'auto',
                position: 'relative',
              }}
            >
              {/* Virtual spacer for total height */}
              <div
                style={{
                  height: totalHeight,
                  position: 'relative',
                  // Hint to browser about content changes
                  willChange: 'transform',
                }}
              >
                {/* Visible entries container with transform optimization */}
                <div
                  style={{
                    transform: `translateY(${offsetY}px)`,
                    // Optimize compositing during scroll
                    willChange: isScrolling ? 'transform' : 'auto',
                  }}
                >
                  {visibleEntries.map(([source, translation], index) => {
                    const actualIndex = startIndex + index;
                    return (
                      <VirtualRow
                        key={`${selectedDictionary}-${source}-${actualIndex}`}
                        source={source}
                        translation={translation}
                        _index={index}
                        actualIndex={actualIndex}
                        isScrolling={isScrolling}
                        isSelected={selectedEntries.has(source)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Entry editing modal */}
      {editingEntry && (
        <DictionaryEntry
          onClose={() => setEditingEntry(null)}
          entry={editingEntry}
          selectedDictionary={selectedDictionary}
        />
      )}

      {/* Move entry dialog */}
      {moveEntry && (
        <MoveEntryDialog
          onClose={() => setMoveEntry(null)}
          entry={moveEntry}
          currentDictionary={selectedDictionary}
        />
      )}

      {/* Context menu */}
      {contextMenu.visible && contextMenu.entry && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--background-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 2000,
            minWidth: '180px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleContextMenuEdit}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-color)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--secondary-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Edit2 size={14} />
            <span>Edit Entry</span>
          </button>

          <button
            onClick={handleContextMenuMove}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-color)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--secondary-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronsUp size={14} />
            <span>Move to...</span>
          </button>

          <div
            style={{
              height: '1px',
              backgroundColor: 'var(--border-color)',
              margin: '0.25rem 0',
            }}
          />

          <button
            onClick={handleContextMenuDelete}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--danger-button-text)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={14} />
            <span>Delete Entry</span>
          </button>
        </div>
      )}

      {/* Bulk move dialog */}
      {showBulkMoveDialog && (
        <BulkMoveDialog
          selectedDictionary={selectedDictionary}
          selectedEntries={selectedEntries}
          isMoving={isMoving}
          onSetMoving={setIsMoving}
          onClose={() => setShowBulkMoveDialog(false)}
          onMoveSuccess={() => {
            setSelectedEntries(new Set());
            setShowBulkMoveDialog(false);
          }}
        />
      )}
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;

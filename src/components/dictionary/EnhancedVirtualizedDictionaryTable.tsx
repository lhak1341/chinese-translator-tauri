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
        <span
          key={index}
          style={{
            color: color,
            fontWeight: 700,
          }}
        >
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
      style={{
        display: 'inline-block',
        cursor: 'pointer',
        transition: 'all 0.15s',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '0.65rem',
        fontWeight: 600,
        userSelect: 'none',
        background: active ? config.activeColor : 'transparent',
        color: active ? 'white' : config.inactiveColor,
        border: active ? 'none' : `1px solid ${config.inactiveColor}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
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
}) => {
  const { dictionaries, deleteEntry, updateEntry, isLoading } = useDictionary();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    setDeleteError(null);
    setMoveEntry(null);
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
    setScrollTop(0);
    lastScrollTop.current = 0;
  }, [selectedDictionary]);

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
    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    const entries = Object.entries(dictionary) as [string, DictionaryEntryValue][];

    if (!debouncedSearchTerm) return entries;

    const searchLower = debouncedSearchTerm.toLowerCase();
    const isLargeList = entries.length > LARGE_LIST_THRESHOLD;

    if (isLargeList) {
      // For large lists, process all entries without early termination
      const filtered: [string, DictionaryEntryValue][] = [];
      const batchSize = 500;

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        for (const [source, translation] of batch) {
          const translationText =
            typeof translation === 'string' ? translation : translation.translation;

          if (
            source.toLowerCase().includes(searchLower) ||
            translationText.toLowerCase().includes(searchLower)
          ) {
            filtered.push([source, translation]);
          }
        }
      }

      return filtered;
    } else {
      // Standard filtering for smaller lists
      return entries.filter(([source, translation]) => {
        const translationText =
          typeof translation === 'string' ? translation : translation.translation;
        return (
          source.toLowerCase().includes(searchLower) ||
          translationText.toLowerCase().includes(searchLower)
        );
      });
    }
  }, [dictionaries, selectedDictionary, debouncedSearchTerm]);

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
        console.warn('Buffer size calculation failed:', error);
        // Keep current buffer size on error
      }
    };

    // Calculate on significant changes
    const debounceTimer = setTimeout(calculateOptimalBuffer, 100);
    return () => clearTimeout(debounceTimer);
  }, [containerHeight, filteredEntries.length, scrollVelocity, isScrolling, bufferSize]);

  // Optimized visible range calculation with adaptive buffer
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - bufferSize);
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT);
    const endIndex = Math.min(filteredEntries.length, startIndex + visibleCount + bufferSize * 2);

    return { startIndex, endIndex, visibleCount };
  }, [scrollTop, containerHeight, filteredEntries.length, bufferSize]);

  const { startIndex, endIndex } = visibleRange;
  const visibleEntries = filteredEntries.slice(startIndex, endIndex);

  // Calculate virtual scrolling properties
  const totalHeight = filteredEntries.length * ITEM_HEIGHT;
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
      const currentScrollTop = scrollRef.current?.scrollTop ?? scrollTop;
      setPreservedScrollTop(currentScrollTop);
      setIsUpdating(true);

      try {
        await updateEntry(dictionaryId, oldSource, newSource, translation, metadata);
      } finally {
        setIsUpdating(false);
      }
    },
    [updateEntry, scrollTop]
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

  // Notify parent about selection changes
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
  }, [selectedEntries, isDeleting, showBulkDeleteConfirm, isMoving, onSelectionChange]);

  // Selection handlers with scroll preservation
  const handleSelectEntry = useCallback(
    (source: string, isSelected: boolean): void => {
      // Capture scroll position before selection state change
      const currentScrollTop = scrollRef.current?.scrollTop ?? scrollTop;

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
    },
    [scrollTop]
  );

  const handleSelectAll = useCallback(
    (isSelected: boolean): void => {
      // Capture scroll position before bulk selection change
      const currentScrollTop = scrollRef.current?.scrollTop ?? scrollTop;

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
    [filteredEntries, scrollTop]
  );

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedEntries.size === 0) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Process deletions sequentially to prevent file corruption
      const entriesToDelete = Array.from(selectedEntries);
      for (const source of entriesToDelete) {
        await deleteEntry(selectedDictionary, source);
      }

      setSelectedEntries(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      setDeleteError(`Failed to delete ${selectedEntries.size} entries`);
      console.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkMove = (): void => {
    if (selectedEntries.size === 0) return;
    setShowBulkMoveDialog(true);
  };

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
      setDeleteError(`Failed to delete entry: ${(error as Error).message}`);
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

  // Bulk Move Dialog Component
  const BulkMoveDialog: React.FC = () => {
    const { addEntry } = useDictionary();
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
          console.error('Failed to load dictionaries:', error);
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

      setIsMoving(true);
      setError(null);

      try {
        const entriesToMove = Array.from(selectedEntries);
        const dictionary = dictionaries[selectedDictionary];

        // Move each entry sequentially
        for (const source of entriesToMove) {
          const value = dictionary[source];
          const translation = typeof value === 'string' ? value : value.translation;
          const metadata =
            typeof value === 'object'
              ? {
                  allowAsPatternVariable: value.allowAsPatternVariable,
                  lowPriority: value.lowPriority,
                }
              : {};

          // Add to target dictionary
          await addEntry(selectedTargetDict, source, translation, metadata);
          // Delete from current dictionary
          await deleteEntry(selectedDictionary, source);
        }

        setSelectedEntries(new Set());
        setShowBulkMoveDialog(false);
      } catch (error) {
        setError(`Failed to move entries: ${(error as Error).message}`);
        console.error('Bulk move error:', error);
      } finally {
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
        onClick={() => setShowBulkMoveDialog(false)}
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
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border-color)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
              Move {selectedEntries.size} {selectedEntries.size === 1 ? 'Entry' : 'Entries'}
            </h2>
          </div>

          <div style={{ padding: '1rem' }}>
            <select
              value={selectedTargetDict}
              onChange={(e) => setSelectedTargetDict(e.target.value)}
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
              <option value="">Select target dictionary...</option>
              {availableDictionaries.map((id) => (
                <option key={id} value={id}>
                  {id === 'properNouns'
                    ? 'General Purpose Dictionary'
                    : id.startsWith('properNouns-')
                      ? `Proper Nouns - ${id.replace('properNouns-', '')}`
                      : id.charAt(0).toUpperCase() + id.slice(1)}
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

          <div
            style={{
              padding: '1rem',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button onClick={() => setShowBulkMoveDialog(false)} disabled={isMoving}>
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

  // Optimized row component with React.memo
  const VirtualRow = useMemo(() => {
    interface VirtualRowProps {
      source: string;
      translation: DictionaryEntryValue;
      _index: number;
      actualIndex: number;
    }

    const VirtualRowComponent = React.memo<VirtualRowProps>(
      ({ source, translation, _index, actualIndex }) => {
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
            console.error(`Failed to update ${field}:`, error);
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
            console.error(`Failed to update ${field}:`, error);
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
                backgroundColor:
                  actualIndex % 2 === 0 ? 'var(--background-color)' : 'var(--secondary-bg)',
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
                  checked={selectedEntries.has(source)}
                  onChange={(e) => handleSelectEntry(source, e.target.checked)}
                  style={{ cursor: 'pointer' }}
                  title="Select for deletion"
                />
              </div>

              {/* Source Text - calc(35% - 20px) with variable highlighting */}
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
                    {highlightPatternVariables(source)}
                  </span>
                )}
              </div>

              {/* Translation - calc(65% - 20px) with metadata badges */}
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
                    style={{
                      flex: 1,
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
                  <>
                    <span
                      onClick={() => setEditingTranslation(true)}
                      style={{
                        cursor: 'pointer',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title="Click to edit"
                    >
                      {highlightPatternVariables(translationText)}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
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
                backgroundColor:
                  actualIndex % 2 === 0 ? 'var(--background-color)' : 'var(--secondary-bg)',
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
                  checked={selectedEntries.has(source)}
                  onChange={(e) => handleSelectEntry(source, e.target.checked)}
                  style={{ cursor: 'pointer' }}
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
                    style={{
                      flex: 1,
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
                  <>
                    <span
                      onClick={() => setEditingTranslation(true)}
                      style={{
                        cursor: 'pointer',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title="Click to edit"
                    >
                      {translationText}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
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
              backgroundColor:
                actualIndex % 2 === 0 ? 'var(--background-color)' : 'var(--secondary-bg)',
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
                checked={selectedEntries.has(source)}
                onChange={(e) => handleSelectEntry(source, e.target.checked)}
                style={{ cursor: 'pointer' }}
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
            <div
              style={{
                width: 'calc(65% - 20px)',
                padding: '0.25rem 0.75rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
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
    isScrolling,
    setEditingEntry,
    selectedDictionary,
    updateEntryWithScrollPreservation,
    selectedEntries,
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
      {showBulkMoveDialog && <BulkMoveDialog />}
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;

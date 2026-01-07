/**
 * Common component prop types shared across the application
 *
 * This file provides centralized type definitions for component props,
 * enabling type safety for both .tsx and .jsx components (via JSDoc imports).
 *
 * Usage in .jsx files:
 * @typedef {import('./types/ComponentTypes').TabId} TabId
 * @param {TabId} tab
 */

// =============================================================================
// Tab Navigation Types
// =============================================================================

/**
 * Valid tab identifiers for the main application interface
 */
export type TabId = 'translator' | 'dictionary' | 'configuration' | 'appearance';

/**
 * Tab configuration object
 */
export interface TabConfig {
  id: TabId;
  label: string;
  icon?: string;
  shortcut?: string;
  enabled: boolean;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Dictionary metadata information
 */
export interface DictionaryInfo {
  /** Unique identifier for the dictionary */
  id: string;
  /** Human-readable name */
  name: string;
  /** File system path to dictionary JSON */
  path: string;
  /** Whether this dictionary is currently active */
  isActive: boolean;
  /** Number of entries in the dictionary */
  entryCount?: number;
  /** Dictionary type (characters, phrases, patterns, etc.) */
  type?: 'characters' | 'phrases' | 'patterns' | 'properNouns' | 'conversion' | 'punctuation';
  /** Last modified timestamp */
  lastModified?: string;
  /** File size in bytes */
  fileSize?: number;
}

/**
 * Dictionary type definition with validation
 */
export interface DictionaryTypeDefinition {
  /** Dictionary identifier */
  id: string;
  /** Display label */
  label: string;
  /** Description of the dictionary's purpose */
  description: string;
  /** Dictionary data (can be null for lazy-loaded dictionaries) */
  data: any;
  /** Validation function for dictionary entries */
  validate: (source: string, translation: string) => string | null;
}

/**
 * Collection of all dictionary type definitions
 */
export interface DictionaryTypesCollection {
  [key: string]: DictionaryTypeDefinition;
}

/**
 * WASM (WebAssembly) configuration settings
 */
export interface WasmConfiguration {
  /** Whether WASM acceleration is enabled */
  enabled: boolean;
  /** Memory limit for WASM operations in MB */
  memoryLimit: number;
  /** Whether currently running in fallback (JavaScript) mode */
  fallbackMode: boolean;
  /** Total entries loaded in WASM dictionaries */
  totalEntries?: number;
  /** WASM initialization status */
  initialized?: boolean;
}

/**
 * Application configuration object
 */
export interface AppConfiguration {
  /** List of active proper noun dictionary IDs */
  activeProperNouns: string[];
  /** Whether WASM acceleration is enabled */
  wasmEnabled: boolean;
  /** WASM memory limit in MB */
  wasmMemoryLimit: number;
  /** Last selected dictionary ID */
  lastSelectedDictionary?: string;
  /** Auto-save configuration changes */
  autoSaveEnabled?: boolean;
  /** Enable debug mode logging */
  debugMode?: boolean;
  /** Enable two-phase pattern processing */
  enableTwoPhasePatterns?: boolean;
  /** Enable streaming translation */
  enableStreaming?: boolean;
  /** Chunk size for batch processing */
  chunkSize?: number;
  /** Maximum concurrent operations */
  maxConcurrency?: number;
}

// =============================================================================
// Appearance Types
// =============================================================================

/**
 * Letter spacing options
 */
export type LetterSpacing = 'normal' | 'tight' | 'wide';

/**
 * Font settings for a text area
 */
export interface FontSettings {
  /** Font family name */
  fontFamily: string;
  /** Font size (CSS value, e.g., '1rem', '14px') */
  fontSize: string;
  /** Letter spacing setting */
  letterSpacing: LetterSpacing;
  /** Line height (optional, CSS value) */
  lineHeight?: string;
  /** Font weight (optional, CSS value) */
  fontWeight?: string | number;
  /** Paragraph spacing (optional, CSS value for margin-bottom, e.g., '1rem', '16px') */
  paragraphSpacing?: string;
}

/**
 * Theme options
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * Complete appearance settings for the application
 */
export interface AppearanceSettings {
  /** Font settings for Chinese/original text */
  chineseText: FontSettings;
  /** Font settings for full translation */
  fullTranslation: FontSettings;
  /** Font settings for character-only translation */
  characterOnly: FontSettings;
  /** Font family for UI elements */
  uiFont: Pick<FontSettings, 'fontFamily'>;
  /** Theme selection */
  theme: Theme;
  /** Custom CSS variables (optional) */
  customColors?: Record<string, string>;
}

// =============================================================================
// Dictionary Entry Types
// =============================================================================

/**
 * Basic dictionary entry structure
 */
export interface DictionaryEntry {
  /** Source text (Chinese, pattern, etc.) */
  source: string;
  /** Translation text (Vietnamese) */
  translation: string;
  /** Optional metadata */
  metadata?: DictionaryEntryMetadata;
}

/**
 * Dictionary entry metadata
 */
export interface DictionaryEntryMetadata {
  /** ISO 8601 date when entry was added */
  dateAdded?: string;
  /** ISO 8601 date when entry was last modified */
  dateModified?: string;
  /** Usage frequency counter */
  frequency?: number;
  /** Tags for categorization */
  tags?: string[];
  /** Notes or comments */
  notes?: string;
  /** Whether this entry can be used as a pattern variable */
  allowAsPatternVariable?: boolean;
  /** Low priority flag for pattern competition */
  lowPriority?: boolean;
}

/**
 * Pattern dictionary entry with variable support
 */
export interface PatternEntry extends DictionaryEntry {
  /** Pattern variables (e.g., ['X', 'Y']) */
  variables?: string[];
  /** Whether this pattern can be used as a variable in other patterns */
  allowAsPatternVariable?: boolean;
  /** Low priority flag for same-length pattern conflicts */
  lowPriority?: boolean;
}

// =============================================================================
// Clickable Component Types
// =============================================================================

/**
 * Direction for clickable segment highlighting
 */
export type ClickDirection =
  | 'original-to-translation'
  | 'translation-to-original'
  | 'character-only-to-original';

/**
 * Props for clickable text segments
 */
export interface ClickableSegmentProps {
  /** Text content of the segment */
  text: string;
  /** Index in semantic units array */
  index: number;
  /** Whether this segment is currently highlighted */
  isHighlighted: boolean;
  /** Click handler */
  onClick: (index: number, direction: ClickDirection) => void;
  /** Direction of the click mapping */
  direction: ClickDirection;
  /** Additional CSS class names */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

// =============================================================================
// Virtualization Types
// =============================================================================

/**
 * Virtualization configuration
 */
export interface VirtualizationConfig {
  /** Height of each item in pixels */
  itemHeight: number;
  /** Number of items to render outside viewport (overscan) */
  overscanCount: number;
  /** Minimum number of items before virtualization activates */
  threshold: number;
  /** Whether to force virtualization regardless of threshold */
  forceVirtualization?: boolean;
}

/**
 * Viewport bounds for virtualized rendering
 */
export interface ViewportBounds {
  /** Index of first visible item */
  startIndex: number;
  /** Index of last visible item */
  endIndex: number;
  /** Total number of items in the list */
  totalItems: number;
  /** Viewport height in pixels */
  viewportHeight?: number;
  /** Scroll offset in pixels */
  scrollOffset?: number;
}

/**
 * Virtualized list state
 */
export interface VirtualListState {
  /** Current viewport bounds */
  bounds: ViewportBounds;
  /** Whether virtualization is active */
  isVirtualized: boolean;
  /** Visible items (slice of full list) */
  visibleItems: any[];
  /** Total content height in pixels */
  totalHeight: number;
}

// =============================================================================
// Performance & Monitoring Types
// =============================================================================

/**
 * Performance statistics for operations
 */
export interface PerformanceStats {
  /** Number of operations performed */
  operations: number;
  /** Average operation time in milliseconds */
  avgTime: number;
  /** Cache hit rate (0.0 to 1.0) */
  cacheHitRate: number;
  /** Peak memory usage in MB */
  peakMemory?: number;
  /** Total processing time in milliseconds */
  totalTime?: number;
}

/**
 * WASM engine status information
 */
export interface WasmStatus {
  /** Whether WASM is initialized */
  initialized: boolean;
  /** Whether currently in fallback mode */
  fallbackMode: boolean;
  /** Total entries loaded in WASM */
  totalEntries: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** WASM version string */
  version?: string;
}

// =============================================================================
// Translation Display Types
// =============================================================================

/**
 * Text size options for translation display
 */
export type TextSize = 'small' | 'medium' | 'large' | 'huge';

/**
 * Text size mapping to CSS values
 */
export interface TextSizeMapping {
  small: string; // e.g., '0.875rem'
  medium: string; // e.g., '1rem'
  large: string; // e.g., '1.25rem'
  huge: string; // e.g., '1.5rem'
}

/**
 * Layout mode for translation panels
 */
export type LayoutMode = 'horizontal' | 'vertical' | 'grid';

/**
 * Layout configuration
 */
export interface LayoutConfig {
  /** Layout mode */
  mode: LayoutMode;
  /** Panel size ratio (0.0 to 1.0) */
  panelRatio: number;
  /** Show original Chinese text panel */
  showOriginal: boolean;
  /** Show character-only translation panel */
  showCharacterOnly: boolean;
  /** Show full translation panel */
  showTranslation: boolean;
}

// =============================================================================
// Keyboard Shortcut Types
// =============================================================================

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** Key identifier (e.g., 'r', '1', 'ArrowUp') */
  key: string;
  /** Requires Ctrl key */
  ctrl?: boolean;
  /** Requires Shift key */
  shift?: boolean;
  /** Requires Alt key */
  alt?: boolean;
  /** Requires Meta/Command key */
  meta?: boolean;
  /** Human-readable description */
  description: string;
  /** Action to perform */
  action: () => void | Promise<void>;
  /** Whether shortcut is enabled */
  enabled?: boolean;
}

// =============================================================================
// Modal & Dialog Types
// =============================================================================

/**
 * Modal size options
 */
export type ModalSize = 'small' | 'medium' | 'large' | 'fullscreen';

/**
 * Modal configuration
 */
export interface ModalConfig {
  /** Modal title */
  title: string;
  /** Modal content */
  content: React.ReactNode;
  /** Close handler */
  onClose: () => void;
  /** Confirm handler (optional) */
  onConfirm?: () => void | Promise<void>;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Modal size */
  size?: ModalSize;
  /** Show close button */
  showCloseButton?: boolean;
  /** Click outside to close */
  closeOnOutsideClick?: boolean;
  /** Press Escape to close */
  closeOnEscape?: boolean;
}

// =============================================================================
// Form & Input Types
// =============================================================================

/**
 * Input validation result
 */
export interface ValidationResult {
  /** Whether input is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warning message (valid but with concerns) */
  warning?: string;
}

/**
 * Form field state
 */
export interface FormFieldState<T = string> {
  /** Current value */
  value: T;
  /** Whether field has been touched */
  touched: boolean;
  /** Whether field is being edited */
  editing: boolean;
  /** Validation result */
  validation: ValidationResult;
  /** Original value (for reset) */
  originalValue?: T;
}

/**
 * Inline edit state
 */
export interface InlineEditState {
  /** Whether currently editing */
  isEditing: boolean;
  /** Current edited value */
  editValue: string;
  /** Original value before edit */
  originalValue: string;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Error message if save failed */
  error: string | null;
}

// =============================================================================
// Loading & Error States
// =============================================================================

/**
 * Async operation state
 */
export interface AsyncOperationState<T = any> {
  /** Whether operation is loading */
  isLoading: boolean;
  /** Result data if successful */
  data: T | null;
  /** Error if operation failed */
  error: Error | null;
  /** Timestamp of last update */
  lastUpdated: number | null;
}

/**
 * Reload state for components with refresh capability
 */
export interface ReloadState {
  /** Whether reload is in progress */
  isReloading: boolean;
  /** Timestamp of last reload */
  lastReload: number | null;
  /** Number of consecutive reload failures */
  failureCount: number;
  /** Error from last failed reload */
  lastError: Error | null;
}

// =============================================================================
// Export all types as a namespace for convenience
// =============================================================================

export {};

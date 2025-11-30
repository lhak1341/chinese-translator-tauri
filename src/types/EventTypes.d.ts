/**
 * Custom event types for application-wide events
 *
 * Provides type definitions for custom events emitted throughout the application.
 * Enables type-safe event handling and event emitter implementations.
 *
 * Usage:
 * @typedef {import('./types/EventTypes').TranslationStartEvent} TranslationStartEvent
 * @param {TranslationStartEvent} event
 */

import type { TranslationResult } from './SemanticTypes';
import type { DictionaryEntry } from './ComponentTypes';
import type { AppConfiguration, AppearanceSettings } from './ComponentTypes';

// =============================================================================
// Translation Events
// =============================================================================

/**
 * Event emitted when translation starts
 */
export interface TranslationStartEvent {
  /** Event type identifier */
  type: 'translation:start';
  /** Text being translated */
  text: string;
  /** Translation options */
  options: Record<string, any>;
  /** Event timestamp */
  timestamp: number;
  /** Translation session ID */
  sessionId?: string;
}

/**
 * Event emitted when translation completes successfully
 */
export interface TranslationCompleteEvent {
  /** Event type identifier */
  type: 'translation:complete';
  /** Translation result */
  result: TranslationResult;
  /** Translation duration in milliseconds */
  duration: number;
  /** Event timestamp */
  timestamp: number;
  /** Translation session ID */
  sessionId?: string;
}

/**
 * Event emitted when translation encounters an error
 */
export interface TranslationErrorEvent {
  /** Event type identifier */
  type: 'translation:error';
  /** Error object */
  error: Error;
  /** Error context information */
  context: Record<string, any>;
  /** Event timestamp */
  timestamp: number;
  /** Translation session ID */
  sessionId?: string;
}

/**
 * Event emitted during translation progress updates
 */
export interface TranslationProgressEvent {
  /** Event type identifier */
  type: 'translation:progress';
  /** Progress percentage (0-100) */
  progress: number;
  /** Completed chunks */
  completedChunks: number;
  /** Total chunks */
  totalChunks: number;
  /** Current batch number */
  batchNumber: number;
  /** Event timestamp */
  timestamp: number;
  /** Translation session ID */
  sessionId?: string;
}

/**
 * Event emitted when translation is cancelled
 */
export interface TranslationCancelEvent {
  /** Event type identifier */
  type: 'translation:cancel';
  /** Reason for cancellation */
  reason?: string;
  /** Event timestamp */
  timestamp: number;
  /** Translation session ID */
  sessionId?: string;
}

// =============================================================================
// Dictionary Events
// =============================================================================

/**
 * Event emitted when a dictionary is loaded
 */
export interface DictionaryLoadEvent {
  /** Event type identifier */
  type: 'dictionary:load';
  /** Dictionary identifier */
  dictionaryId: string;
  /** Number of entries loaded */
  entryCount: number;
  /** Load duration in milliseconds */
  duration?: number;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Dictionary operation type
 */
export type DictionaryOperation = 'add' | 'update' | 'delete' | 'move';

/**
 * Event emitted when a dictionary entry is modified
 */
export interface DictionaryUpdateEvent {
  /** Event type identifier */
  type: 'dictionary:update';
  /** Dictionary identifier */
  dictionaryId: string;
  /** Operation performed */
  operation: DictionaryOperation;
  /** Dictionary entry affected */
  entry: DictionaryEntry;
  /** Previous entry (for updates) */
  previousEntry?: DictionaryEntry;
  /** Target dictionary (for moves) */
  targetDictionaryId?: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when dictionary fails to load or save
 */
export interface DictionaryErrorEvent {
  /** Event type identifier */
  type: 'dictionary:error';
  /** Dictionary identifier */
  dictionaryId: string;
  /** Error object */
  error: Error;
  /** Operation that failed */
  operation: 'load' | 'save' | 'create' | 'delete';
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when dictionary is reloaded
 */
export interface DictionaryReloadEvent {
  /** Event type identifier */
  type: 'dictionary:reload';
  /** Dictionaries that were reloaded */
  dictionaryIds: string[];
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// Configuration Events
// =============================================================================

/**
 * Event emitted when configuration changes
 */
export interface ConfigurationChangeEvent {
  /** Event type identifier */
  type: 'configuration:change';
  /** Configuration key that changed */
  key: string;
  /** Previous value */
  oldValue: any;
  /** New value */
  newValue: any;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when configuration is saved
 */
export interface ConfigurationSaveEvent {
  /** Event type identifier */
  type: 'configuration:save';
  /** Complete configuration object */
  configuration: AppConfiguration;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when configuration fails to save or load
 */
export interface ConfigurationErrorEvent {
  /** Event type identifier */
  type: 'configuration:error';
  /** Error object */
  error: Error;
  /** Operation that failed */
  operation: 'load' | 'save';
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// Appearance Events
// =============================================================================

/**
 * Event emitted when appearance settings change
 */
export interface AppearanceChangeEvent {
  /** Event type identifier */
  type: 'appearance:change';
  /** Updated appearance settings */
  settings: AppearanceSettings;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when theme changes
 */
export interface ThemeChangeEvent {
  /** Event type identifier */
  type: 'appearance:theme-change';
  /** Previous theme */
  oldTheme: 'light' | 'dark' | 'auto';
  /** New theme */
  newTheme: 'light' | 'dark' | 'auto';
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// Performance Events
// =============================================================================

/**
 * Event emitted when performance metric is recorded
 */
export interface PerformanceMetricEvent {
  /** Event type identifier */
  type: 'performance:metric';
  /** Metric name */
  name: string;
  /** Metric value (typically duration in ms) */
  value: number;
  /** Additional metric metadata */
  metadata?: Record<string, any>;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when performance threshold is exceeded
 */
export interface PerformanceThresholdEvent {
  /** Event type identifier */
  type: 'performance:threshold';
  /** Operation that exceeded threshold */
  operation: string;
  /** Actual duration */
  duration: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Severity level */
  severity: 'warning' | 'critical';
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when memory usage changes significantly
 */
export interface MemoryUsageEvent {
  /** Event type identifier */
  type: 'performance:memory';
  /** Heap usage in bytes */
  heapUsed: number;
  /** Heap limit in bytes */
  heapLimit: number;
  /** Usage percentage (0-100) */
  percentage: number;
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// WASM Events
// =============================================================================

/**
 * Event emitted when WASM module initializes
 */
export interface WasmInitEvent {
  /** Event type identifier */
  type: 'wasm:init';
  /** Whether initialization succeeded */
  success: boolean;
  /** Initialization duration in milliseconds */
  duration: number;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when WASM falls back to JavaScript
 */
export interface WasmFallbackEvent {
  /** Event type identifier */
  type: 'wasm:fallback';
  /** Reason for fallback */
  reason: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when WASM error occurs
 */
export interface WasmErrorEvent {
  /** Event type identifier */
  type: 'wasm:error';
  /** Error object */
  error: Error;
  /** Operation that failed */
  operation: string;
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// Cache Events
// =============================================================================

/**
 * Event emitted when cache is cleared
 */
export interface CacheClearEvent {
  /** Event type identifier */
  type: 'cache:clear';
  /** Cache type that was cleared */
  cacheType: string;
  /** Number of entries cleared */
  entriesCleared: number;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted on cache hit
 */
export interface CacheHitEvent {
  /** Event type identifier */
  type: 'cache:hit';
  /** Cache key */
  key: string;
  /** Cache type */
  cacheType: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted on cache miss
 */
export interface CacheMissEvent {
  /** Event type identifier */
  type: 'cache:miss';
  /** Cache key */
  key: string;
  /** Cache type */
  cacheType: string;
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// UI Events
// =============================================================================

/**
 * Event emitted when tab changes
 */
export interface TabChangeEvent {
  /** Event type identifier */
  type: 'ui:tab-change';
  /** Previous tab */
  previousTab: string;
  /** New active tab */
  newTab: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when keyboard shortcut is triggered
 */
export interface KeyboardShortcutEvent {
  /** Event type identifier */
  type: 'ui:shortcut';
  /** Shortcut key combination */
  key: string;
  /** Modifiers (ctrl, shift, alt, meta) */
  modifiers: string[];
  /** Action performed */
  action: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when modal opens
 */
export interface ModalOpenEvent {
  /** Event type identifier */
  type: 'ui:modal-open';
  /** Modal identifier */
  modalId: string;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event emitted when modal closes
 */
export interface ModalCloseEvent {
  /** Event type identifier */
  type: 'ui:modal-close';
  /** Modal identifier */
  modalId: string;
  /** Close reason (confirmed, cancelled, dismissed) */
  reason: 'confirmed' | 'cancelled' | 'dismissed';
  /** Event timestamp */
  timestamp: number;
}

// =============================================================================
// Union Type of All Events
// =============================================================================

/**
 * Union type of all custom application events
 */
export type AppEvent =
  // Translation events
  | TranslationStartEvent
  | TranslationCompleteEvent
  | TranslationErrorEvent
  | TranslationProgressEvent
  | TranslationCancelEvent
  // Dictionary events
  | DictionaryLoadEvent
  | DictionaryUpdateEvent
  | DictionaryErrorEvent
  | DictionaryReloadEvent
  // Configuration events
  | ConfigurationChangeEvent
  | ConfigurationSaveEvent
  | ConfigurationErrorEvent
  // Appearance events
  | AppearanceChangeEvent
  | ThemeChangeEvent
  // Performance events
  | PerformanceMetricEvent
  | PerformanceThresholdEvent
  | MemoryUsageEvent
  // WASM events
  | WasmInitEvent
  | WasmFallbackEvent
  | WasmErrorEvent
  // Cache events
  | CacheClearEvent
  | CacheHitEvent
  | CacheMissEvent
  // UI events
  | TabChangeEvent
  | KeyboardShortcutEvent
  | ModalOpenEvent
  | ModalCloseEvent;

// =============================================================================
// Event Emitter Interface
// =============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void;

/**
 * Event emitter interface for type-safe event handling
 */
export interface EventEmitter {
  /**
   * Register an event handler
   * @returns Unsubscribe function
   */
  on<T extends AppEvent>(type: T['type'], handler: EventHandler<T>): () => void;

  /**
   * Emit an event to all registered handlers
   */
  emit<T extends AppEvent>(event: T): void;

  /**
   * Remove a specific event handler
   */
  off<T extends AppEvent>(type: T['type'], handler: EventHandler<T>): void;

  /**
   * Register a one-time event handler
   * @returns Unsubscribe function
   */
  once<T extends AppEvent>(type: T['type'], handler: EventHandler<T>): () => void;

  /**
   * Remove all handlers for a specific event type
   */
  removeAllListeners(type?: AppEvent['type']): void;

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(type: AppEvent['type']): number;
}

// =============================================================================
// Export all types
// =============================================================================

export {};

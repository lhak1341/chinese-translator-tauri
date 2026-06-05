/**
 * Custom hook types for application hooks
 *
 * Provides type definitions for custom React hooks used throughout the application.
 * Formalizes return types and parameters for better type safety.
 *
 * Usage in .jsx files:
 * @typedef {import('./types/HookTypes').UsePerformanceMonitoringReturn} UsePerformanceMonitoringReturn
 * @returns {UsePerformanceMonitoringReturn}
 */

import type { PerformanceMetrics, RegressionHealth } from './PerformanceTypes';
import type { SemanticArrays, ProgressData } from './SemanticTypes';
import type { Theme, ColorScheme, ThemeColors } from './UITypes';
import type { KeyboardShortcut } from './UITypes';

// =============================================================================
// Performance Monitoring Hook
// =============================================================================

/**
 * Return type for usePerformanceMonitoring hook
 */
export interface UsePerformanceMonitoringReturn {
  /** Current performance statistics */
  performanceStats: PerformanceMetrics;
  /** Regression detection health status */
  regressionHealth: RegressionHealth;
  /** Record a completed translation — timing only */
  recordTranslation: (operationTimeMs: number) => void;
  /** Refresh regression health after a cache-driven event (e.g. dictionary reload) */
  refreshCacheStats: () => void;
}

/**
 * Options for usePerformanceMonitoring hook
 */
export interface UsePerformanceMonitoringOptions {
  /** Enable automatic metric collection */
  enabled?: boolean;
  /** Metric collection sample rate (0-1) */
  sampleRate?: number;
  /** Maximum number of metrics to store */
  maxMetrics?: number;
  /** Enable regression detection */
  enableRegressionDetection?: boolean;
}

// =============================================================================
// Streaming Translation Hook
// =============================================================================

/**
 * Streaming translation state
 */
export interface StreamingTranslationState {
  /** Partial translated text (incrementally updated) */
  partialText: string;
  /** Translation progress (0-100) */
  progress: number;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Number of completed chunks */
  completedChunks: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Current batch number */
  batchNumber: number;
  /** Average time per chunk (ms) */
  avgTimePerChunk: number;
  /** Partial semantic arrays (updated during streaming) */
  semanticArrays: SemanticArrays | null;
}

/**
 * Return type for useStreamingTranslation hook
 */
export interface UseStreamingTranslationReturn {
  /** Current streaming state */
  streamingState: StreamingTranslationState;
  /** Start streaming translation */
  startStreaming: () => void;
  /** Stop/cancel streaming translation */
  stopStreaming: () => void;
  /** Update streaming progress (called by translation engine) */
  updateProgress: (data: ProgressData) => void;
  /** Reset streaming state */
  resetStreaming: () => void;
}

/**
 * Options for useStreamingTranslation hook
 */
export interface UseStreamingTranslationOptions {
  /** Enable streaming mode */
  enabled?: boolean;
  /** UI update throttle interval (ms) */
  throttleInterval?: number;
  /** Chunk size for streaming */
  chunkSize?: number;
  /** Callback when streaming completes */
  onComplete?: (finalText: string, semanticArrays: SemanticArrays) => void;
  /** Callback when streaming errors */
  onError?: (error: Error) => void;
}

// =============================================================================
// Dictionary Modals Hook
// =============================================================================

/**
 * Return type for useDictionaryModals hook.
 * Pure UI concern — Quick Add modal state only. activeProperNouns is NOT here;
 * use activeProperNounsFromConfig from useTranslatorEngine.
 */
export interface UseDictionaryModalsReturn {
  modalState: { isOpen: boolean; dictionaryId: string; text: string };
  showQuickAdd: boolean;
  quickAddDictionary: string;
  clipboardText: string;
  openQuickAddCharacter: (text?: string) => void;
  openQuickAddPhrase: (text?: string) => void;
  openQuickAddProperNoun: (text?: string) => void;
  openQuickAddPattern: (text?: string) => void;
  openQuickAddCustomProperNoun: (text?: string) => Promise<void>;
  closeQuickAdd: () => void;
  handleQuickAddDictionaryChange: (dictionaryId: string) => void;
}

/**
 * Dictionary configuration data
 */
export interface DictionaryConfig {
  /** Active dictionary IDs */
  activeProperNouns: string[];
  /** WASM enabled state */
  wasmEnabled: boolean;
  /** WASM memory limit (MB) */
  wasmMemoryLimit: number;
}

// =============================================================================
// Theme Hook
// =============================================================================

/**
 * Return type for useTheme hook
 */
export interface UseThemeReturn {
  /** Current theme setting */
  theme: Theme;
  /** Resolved color scheme (auto becomes light/dark) */
  colorScheme: ColorScheme;
  /** Set theme */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** Current theme colors */
  colors: ThemeColors;
  /** Whether system prefers dark mode (for 'auto' theme) */
  systemPrefersDark: boolean;
}

/**
 * Options for useTheme hook
 */
export interface UseThemeOptions {
  /** Default theme */
  defaultTheme?: Theme;
  /** Persist theme preference to storage */
  persist?: boolean;
  /** Storage key for persisted theme */
  storageKey?: string;
}

// =============================================================================
// Keyboard Shortcuts Hook
// =============================================================================

/**
 * Return type for useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsReturn {
  /** Register a new keyboard shortcut */
  registerShortcut: (shortcut: KeyboardShortcut) => () => void;
  /** Unregister a keyboard shortcut */
  unregisterShortcut: (key: string, modifiers?: KeyModifiers) => void;
  /** Disable all shortcuts temporarily */
  disableShortcuts: () => void;
  /** Re-enable all shortcuts */
  enableShortcuts: () => void;
  /** Get all registered shortcuts */
  getShortcuts: () => KeyboardShortcut[];
  /** Check if a shortcut is registered */
  isShortcutRegistered: (key: string, modifiers?: KeyModifiers) => boolean;
}

/**
 * Key modifiers for shortcuts
 */
export interface KeyModifiers {
  /** Ctrl key */
  ctrl?: boolean;
  /** Shift key */
  shift?: boolean;
  /** Alt key */
  alt?: boolean;
  /** Meta/Command key */
  meta?: boolean;
}

/**
 * Options for useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsOptions {
  /** Enable shortcuts globally */
  enabled?: boolean;
  /** Prevent shortcuts when typing in inputs */
  preventInInputs?: boolean;
  /** Custom target element (default: document) */
  target?: HTMLElement | Document;
}

// =============================================================================
// Local Storage Hook
// =============================================================================

/**
 * Return type for useLocalStorage hook
 */
export interface UseLocalStorageReturn<T> {
  /** Current stored value */
  value: T;
  /** Set new value */
  setValue: (value: T | ((prev: T) => T)) => void;
  /** Remove value from storage */
  removeValue: () => void;
  /** Whether storage operation is in progress */
  isLoading: boolean;
  /** Error if storage operation failed */
  error: Error | null;
}

/**
 * Options for useLocalStorage hook
 */
export interface UseLocalStorageOptions<T> {
  /** Custom serializer */
  serializer?: (value: T) => string;
  /** Custom deserializer */
  deserializer?: (value: string) => T;
  /** Sync across tabs */
  syncAcrossTabs?: boolean;
  /** Callback when value changes */
  onChange?: (newValue: T, oldValue: T) => void;
}

// =============================================================================
// Debounce Hook
// =============================================================================

/**
 * Return type for useDebounce hook
 */
export interface UseDebounceReturn<T> {
  /** Debounced value */
  debouncedValue: T;
  /** Cancel pending debounce */
  cancel: () => void;
  /** Flush debounce immediately */
  flush: () => void;
  /** Whether debounce is pending */
  isPending: boolean;
}

/**
 * Options for useDebounce hook
 */
export interface UseDebounceOptions {
  /** Debounce delay (ms) */
  delay: number;
  /** Call on leading edge */
  leading?: boolean;
  /** Call on trailing edge */
  trailing?: boolean;
  /** Maximum wait time (ms) */
  maxWait?: number;
}

// =============================================================================
// Previous Value Hook
// =============================================================================

/**
 * Return type for usePrevious hook
 */
export type UsePreviousReturn<T> = T | undefined;

// =============================================================================
// Window Size Hook
// =============================================================================

/**
 * Window size dimensions
 */
export interface WindowSize {
  /** Window width (px) */
  width: number;
  /** Window height (px) */
  height: number;
}

/**
 * Return type for useWindowSize hook
 */
export interface UseWindowSizeReturn extends WindowSize {
  /** Whether window is mobile size */
  isMobile: boolean;
  /** Whether window is tablet size */
  isTablet: boolean;
  /** Whether window is desktop size */
  isDesktop: boolean;
}

/**
 * Options for useWindowSize hook
 */
export interface UseWindowSizeOptions {
  /** Debounce delay for resize events (ms) */
  debounceDelay?: number;
  /** Mobile breakpoint (px) */
  mobileBreakpoint?: number;
  /** Tablet breakpoint (px) */
  tabletBreakpoint?: number;
}

// =============================================================================
// Async State Hook
// =============================================================================

/**
 * Async operation state
 */
export interface AsyncState<T = any, E = Error> {
  /** Operation data */
  data: T | null;
  /** Operation error */
  error: E | null;
  /** Whether operation is loading */
  isLoading: boolean;
  /** Whether operation has completed (success or error) */
  isComplete: boolean;
  /** Timestamp of last update */
  lastUpdated: number | null;
}

/**
 * Return type for useAsync hook
 */
export interface UseAsyncReturn<T = any, E = Error> extends AsyncState<T, E> {
  /** Execute async operation */
  execute: (...args: any[]) => Promise<T>;
  /** Reset state to initial */
  reset: () => void;
  /** Manually set data */
  setData: (data: T) => void;
  /** Manually set error */
  setError: (error: E) => void;
}

/**
 * Options for useAsync hook
 */
export interface UseAsyncOptions<T> {
  /** Execute on mount */
  executeOnMount?: boolean;
  /** Callback on success */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Retry count on failure */
  retryCount?: number;
  /** Retry delay (ms) */
  retryDelay?: number;
}

// =============================================================================
// Interval Hook
// =============================================================================

/**
 * Return type for useInterval hook
 */
export interface UseIntervalReturn {
  /** Start interval */
  start: () => void;
  /** Stop interval */
  stop: () => void;
  /** Whether interval is running */
  isRunning: boolean;
  /** Restart interval */
  restart: () => void;
}

/**
 * Options for useInterval hook
 */
export interface UseIntervalOptions {
  /** Whether interval starts immediately */
  immediate?: boolean;
  /** Whether interval continues after component unmount */
  persistent?: boolean;
}

// =============================================================================
// Export all types
// =============================================================================

export {};

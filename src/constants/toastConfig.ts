/**
 * Central Toast Notification Configuration
 *
 * Provides standardized duration constants for toast notifications across the application.
 * Using these constants ensures consistent timing for different notification types.
 *
 * Usage:
 * ```typescript
 * import { TOAST_DURATIONS } from '@/constants/toastConfig';
 *
 * toast.success('Operation completed', { duration: TOAST_DURATIONS.SUCCESS });
 * toast.error('Failed to save', { duration: TOAST_DURATIONS.ERROR });
 * toast.warning('Cache degraded', { duration: TOAST_DURATIONS.CACHE_WARNING });
 * ```
 */

/**
 * Standard duration constants for toast notifications (in milliseconds)
 *
 * Duration Guidelines:
 * - SUCCESS: Quick dismissal for confirmations (3s)
 * - ERROR: Medium duration for errors requiring attention (5s)
 * - WARNING: Medium duration for warnings (4s)
 * - CRITICAL: Long duration for blocking issues requiring immediate action (10s)
 * - CACHE_WARNING: Extended duration for performance warnings with instructions (8s)
 * - MOVE_ERROR: Extended duration for complex operations with rollback info (7s)
 * - LOAD_FAILURE: Medium-long duration for resource loading failures (5s)
 * - PERSISTENT: Never auto-dismiss (0 = requires manual dismiss)
 */
export const TOAST_DURATIONS = {
  /** Success messages - 3 seconds (quick confirmation) */
  SUCCESS: 3000,

  /** Error messages - 5 seconds (needs attention) */
  ERROR: 5000,

  /** Warning messages - 4 seconds (moderate importance) */
  WARNING: 4000,

  /** Critical errors - 10 seconds (blocking issues, initialization failures) */
  CRITICAL: 10000,

  /** Cache/performance warnings - 8 seconds (includes recovery instructions) */
  CACHE_WARNING: 8000,

  /** Move/complex operation errors - 7 seconds (includes rollback info) */
  MOVE_ERROR: 7000,

  /** Resource loading failures - 5 seconds (WASM, dictionary, Rust index) */
  LOAD_FAILURE: 5000,

  /** Persistent notification - requires manual dismiss (0 = no auto-dismiss) */
  PERSISTENT: 0,
} as const;

/**
 * Toast message IDs for deduplication
 *
 * Using these IDs prevents duplicate toasts for the same operation.
 * When a toast with the same ID is triggered, it replaces the previous one
 * instead of stacking multiple identical messages.
 *
 * Usage:
 * ```typescript
 * import { TOAST_IDS } from '@/constants/toastConfig';
 *
 * toast.warning('Cache degraded...', {
 *   duration: TOAST_DURATIONS.CACHE_WARNING,
 *   id: TOAST_IDS.CACHE_DEGRADATION
 * });
 * ```
 */
export const TOAST_IDS = {
  /** Cache performance degradation warning */
  CACHE_DEGRADATION: 'cache-degradation',

  /** Cache invalidation failure (repeated across operations) */
  CACHE_INVALIDATION_FAILED: 'cache-invalidation-failed',

  /** WASM number processor fallback */
  WASM_NUMBER_FALLBACK: 'wasm-number-fallback',

  /** WASM dictionary manager fallback */
  WASM_DICT_FALLBACK: 'wasm-dict-fallback',

  /** Rust lookup index unavailable */
  RUST_INDEX_UNAVAILABLE: 'rust-index-unavailable',

  /** Dictionary reload in progress */
  DICT_RELOAD_IN_PROGRESS: 'dict-reload-in-progress',

  /** Dictionary loading failure */
  DICT_LOAD_FAILED: 'dict-load-failed',

  /** Dictionary corruption detected (CODE REVIEW FIX HIGH-3) */
  DICT_CORRUPTION: 'dict-corruption',

  /** Translation in progress */
  TRANSLATION_IN_PROGRESS: 'translation-in-progress',

  /** Translation completed successfully */
  TRANSLATION_COMPLETED: 'translation-completed',

  /** Configuration save failure */
  CONFIG_SAVE_FAILED: 'config-save-failed',
} as const;

/**
 * Toast stacking configuration
 *
 * Controls how many toasts can be visible simultaneously
 * to prevent overwhelming the user with notifications.
 */
export const TOAST_STACK_CONFIG = {
  /** Maximum number of visible toasts (older ones auto-dismiss) */
  MAX_VISIBLE: 5,

  /** Gap between stacked toasts (CSS rem units) */
  STACK_GAP: '0.5rem',

  /** Animation duration for show/hide (milliseconds) */
  ANIMATION_DURATION: 300,
} as const;

/** Type for toast duration values */
export type ToastDuration = (typeof TOAST_DURATIONS)[keyof typeof TOAST_DURATIONS];

/** Type for toast message IDs */
export type ToastId = (typeof TOAST_IDS)[keyof typeof TOAST_IDS];

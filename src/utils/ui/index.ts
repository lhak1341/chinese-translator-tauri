/**
 * UI feedback utilities public API.
 *
 * Primary entry points:
 *   - DebouncedProgressHandler  — batch progress callbacks during streaming translation
 *   - SmoothLoadingManager      — smooth loading state transitions
 *   - adaptiveBufferCalculator  — optimal virtual scroll buffer sizing
 */

export type {
  ProgressData,
  ProgressCallbacks,
  LoadingState,
  LoadingCallback,
} from './UIResponsiveness';
export { DebouncedProgressHandler, SmoothLoadingManager } from './UIResponsiveness';

// --- Virtual scrolling ---
export { adaptiveBufferCalculator } from './AdaptiveVirtualScrolling';

// --- Scroll position recovery ---
export type { ScrollPositions, RecoveryOptions, AttemptFn } from './ScrollPositionRecovery';
export { ScrollPositionRecovery } from './ScrollPositionRecovery';

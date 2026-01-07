/**
 * UI Responsiveness Utilities
 * Provides debouncing, throttling, and smooth UI update utilities for translation interface
 */

/**
 * Progress data interface (matches ProgressData from SemanticTypes)
 */
export interface ProgressData {
  processedCharacters: number;
  totalCharacters: number;
  currentChunk: number;
  totalChunks: number;
  partialTranslation?: string;
  semanticArrays?: any;
  [key: string]: any;
}

/**
 * Callbacks for debounced progress updates
 */
export interface ProgressCallbacks {
  /** Callback for progress updates */
  onProgressUpdate?: (data: ProgressData) => void;

  /** Callback for translation updates */
  onTranslationUpdate?: (translation: string) => void;

  /** Callback for semantic arrays updates */
  onSemanticArraysUpdate?: (semanticArrays: any) => void;
}

/**
 * Loading state information
 */
export interface LoadingState {
  /** Unique key for this loading state */
  key: string;

  /** Loading message to display */
  message: string;

  /** Start time in milliseconds */
  startTime: number;

  /** Estimated duration in milliseconds (null for indeterminate) */
  estimatedDuration: number | null;

  /** Current progress (0-100) */
  progress: number;

  /** Whether this is indeterminate loading */
  isIndeterminate: boolean;

  /** Whether loading is completed */
  completed?: boolean;
}

/**
 * Callback for loading state changes
 */
export type LoadingCallback = (state: LoadingState) => void;

/**
 * Debounced progress handler to reduce DOM update frequency
 * Batches multiple progress updates into single UI refresh
 */
export class DebouncedProgressHandler {
  private delay: number;
  private pendingUpdate: any;
  private lastUpdate: number;
  private timeoutId: ReturnType<typeof setTimeout> | null;
  private latestProgressData: ProgressData | null;
  private callbacks: {
    progress: ((data: ProgressData) => void) | null;
    translation: ((translation: string) => void) | null;
    semanticArrays: ((semanticArrays: any) => void) | null;
  };

  constructor(delay: number = 100) {
    this.delay = delay;
    this.pendingUpdate = null;
    this.lastUpdate = 0;
    this.timeoutId = null;

    // Store latest progress data
    this.latestProgressData = null;

    // Callbacks for different update types
    this.callbacks = {
      progress: null,
      translation: null,
      semanticArrays: null,
    };
  }

  /**
   * Set up callbacks for different UI updates
   */
  setCallbacks({
    onProgressUpdate,
    onTranslationUpdate,
    onSemanticArraysUpdate,
  }: ProgressCallbacks): void {
    this.callbacks.progress = onProgressUpdate || null;
    this.callbacks.translation = onTranslationUpdate || null;
    this.callbacks.semanticArrays = onSemanticArraysUpdate || null;
  }

  /**
   * Handle progress update with debouncing
   */
  handleProgress(progressData: ProgressData): void {
    // Store latest data
    this.latestProgressData = progressData;

    // Clear existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set up debounced update
    this.timeoutId = setTimeout(() => {
      this.flushUpdates();
    }, this.delay);
  }

  /**
   * Force immediate update (for final results)
   */
  flushUpdates(): void {
    if (!this.latestProgressData) return;

    const data = this.latestProgressData;

    // Batch all UI updates together
    if (this.callbacks.progress) {
      this.callbacks.progress(data);
    }

    if (this.callbacks.translation && data.partialTranslation) {
      this.callbacks.translation(data.partialTranslation);
    }

    if (this.callbacks.semanticArrays && data.semanticArrays) {
      this.callbacks.semanticArrays(data.semanticArrays);
    }

    this.lastUpdate = performance.now();
    this.timeoutId = null;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.latestProgressData = null;
  }
}

/**
 * Smooth loading state manager
 * Provides better visual feedback during WASM initialization and translation
 */
export class SmoothLoadingManager {
  private loadingStates: Map<string, LoadingState>;
  private callbacks: Map<string, LoadingCallback>;

  constructor() {
    this.loadingStates = new Map();
    this.callbacks = new Map();
  }

  /**
   * Start loading state with smooth transitions
   */
  startLoading(
    key: string,
    message: string = 'Loading...',
    estimatedDuration: number | null = null
  ): void {
    const loadingState: LoadingState = {
      key,
      message,
      startTime: performance.now(),
      estimatedDuration,
      progress: 0,
      isIndeterminate: estimatedDuration === null,
    };

    this.loadingStates.set(key, loadingState);

    // Trigger callback if registered
    const callback = this.callbacks.get(key);
    if (callback) {
      callback(loadingState);
    }

    // Start progress animation for determinate loading
    if (estimatedDuration) {
      this.animateProgress(key);
    }
  }

  /**
   * Update loading progress
   */
  updateProgress(key: string, progress: number, message: string | null = null): void {
    const state = this.loadingStates.get(key);
    if (!state) return;

    state.progress = Math.min(100, Math.max(0, progress));
    if (message) state.message = message;

    const callback = this.callbacks.get(key);
    if (callback) {
      callback(state);
    }
  }

  /**
   * Complete loading state
   */
  completeLoading(key: string, finalMessage: string = 'Complete'): void {
    const state = this.loadingStates.get(key);
    if (!state) return;

    state.progress = 100;
    state.message = finalMessage;
    state.completed = true;

    const callback = this.callbacks.get(key);
    if (callback) {
      callback(state);
    }

    // Clean up after delay
    setTimeout(() => {
      this.loadingStates.delete(key);
    }, 1000);
  }

  /**
   * Register callback for loading state changes
   */
  onLoadingChange(key: string, callback: LoadingCallback): void {
    this.callbacks.set(key, callback);
  }

  /**
   * Animate progress for estimated duration loading
   */
  private animateProgress(key: string): void {
    const state = this.loadingStates.get(key);
    if (!state || state.completed) return;

    const elapsed = performance.now() - state.startTime;
    const progress = Math.min(95, (elapsed / (state.estimatedDuration || 1)) * 100);

    state.progress = progress;

    const callback = this.callbacks.get(key);
    if (callback) {
      callback(state);
    }

    // Continue animation
    if (progress < 95) {
      requestAnimationFrame(() => this.animateProgress(key));
    }
  }
}

/**
 * Throttled scroll handler for smooth scrolling performance
 */
export class ThrottledScrollHandler {
  private delay: number;
  private lastExecution: number;
  private timeoutId: ReturnType<typeof setTimeout> | null;

  constructor(delay: number = 16) {
    // ~60fps
    this.delay = delay;
    this.lastExecution = 0;
    this.timeoutId = null;
  }

  /**
   * Throttle scroll events for smooth performance
   */
  handleScroll(callback: () => void): void {
    const now = performance.now();

    if (now - this.lastExecution >= this.delay) {
      callback();
      this.lastExecution = now;
    } else {
      // Schedule delayed execution
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      this.timeoutId = setTimeout(
        () => {
          callback();
          this.lastExecution = performance.now();
          this.timeoutId = null;
        },
        this.delay - (now - this.lastExecution)
      );
    }
  }

  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

/**
 * Utility for smooth DOM updates with requestAnimationFrame
 */
export const smoothDOMUpdate = (updateFunction: () => void): void => {
  requestAnimationFrame(() => {
    updateFunction();
  });
};

/**
 * Batch multiple state updates to reduce re-renders
 */
export const batchStateUpdates = (updates: (() => void)[]): void => {
  // Use React's automatic batching (React 18+) or manual batching
  Promise.resolve().then(() => {
    updates.forEach((update) => update());
  });
};

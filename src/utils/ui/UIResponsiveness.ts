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
 * Debounced progress handler to reduce DOM update frequency
 * Batches multiple progress updates into single UI refresh
 */
export class DebouncedProgressHandler {
  private delay: number;
  private timeoutId: ReturnType<typeof setTimeout> | null;
  private latestProgressData: ProgressData | null;
  private callbacks: {
    progress: ((data: ProgressData) => void) | null;
    translation: ((translation: string) => void) | null;
    semanticArrays: ((semanticArrays: any) => void) | null;
  };

  constructor(delay: number = 100) {
    this.delay = delay;
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

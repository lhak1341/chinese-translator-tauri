/**
 * Translation Engine Factory
 *
 * Factory function for creating TranslationEngine instances in tests.
 * Provides clean initialization without Tauri dependencies.
 */

import { TranslationEngine } from './TranslationEngine.js';

/**
 * Create a new TranslationEngine instance for testing
 *
 * @returns {TranslationEngine} New engine instance
 */
export function createTranslationEngine() {
  return new TranslationEngine({
    // Default test configuration
    debugLevel: 0, // Suppress logs in tests
    enableMemoryMonitoring: false, // Disable in tests
    enablePerformanceMonitoring: false, // Disable in tests
  });
}

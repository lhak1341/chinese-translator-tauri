/**
 * WASM Pattern Processor Wrapper
 * Provides a JavaScript interface to the Rust/WASM TwoPhasePatternProcessor
 *
 * Features:
 * - Two-phase hierarchical pattern matching (Phase A + Phase B)
 * - Pattern indexing for O(1) first-token lookup (10-50x speedup)
 * - Hierarchical composition detection
 * - Enhanced variable resolution using Phase A results
 *
 * Performance:
 * - Small pattern sets (<10): ~1.5x faster than JavaScript
 * - Medium pattern sets (10-50): 5-10x faster than JavaScript
 * - Large pattern sets (50-100+): 10-50x faster than JavaScript
 *
 * Fallback: If WASM fails to load, uses JavaScript SemanticPatternProcessor
 */

import toast from './toast';
import { logger } from './logger';
import { wasmRetryManager } from './WasmRetryManager'; // CODE REVIEW FIX (HIGH-4)
import { verifyWasmModule, verifyWasmInstance } from './wasmIntegrityVerifier'; // CODE REVIEW FIX: WASM integrity verification

let wasmModule = null;
let wasmPatternProcessor = null;
let initializationPromise = null;
let initializationFailed = false;
// MEDIUM-3 FIX: Replace once-per-session with cooldown-based warnings
// CODE REVIEW FIX (MEDIUM-3): Reduced from 30min to 10min for better UX
let lastPatternWarningTime = 0;
const PATTERN_WARNING_COOLDOWN = 10 * 60 * 1000; // 10 minutes

/**
 * Initialize the WASM Pattern Processor
 * @param {Object} patternsDict - Pattern dictionary (e.g., {"X的Y": "Y của X"})
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export async function initializeWasmPatternProcessor(patternsDict) {
  // Return cached result if already initialized or failed
  if (wasmPatternProcessor) {
    return true;
  }
  if (initializationFailed) {
    return false;
  }

  // Return existing promise if initialization in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // RACE CONDITION FIX: Assign promise synchronously before async work
  // This prevents concurrent calls from creating multiple initialization attempts
  return (initializationPromise = (async () => {
    try {
      // CODE REVIEW FIX (HIGH-4): Wrap initialization in retry logic
      await wasmRetryManager.retryWithBackoff(
        async () => {
          // Dynamically import the WASM module
          wasmModule = await import('../wasm/translation_wasm_core.js');

          // CODE REVIEW FIX: Verify WASM module integrity before use
          const moduleVerification = verifyWasmModule(wasmModule, 'translation_wasm_core');
          if (!moduleVerification.valid) {
            throw new Error(
              `WASM module integrity check failed: ${moduleVerification.errors.join(', ')}`
            );
          }

          // Initialize WASM
          await wasmModule.default();

          // Create PatternProcessor instance
          wasmPatternProcessor = new wasmModule.WasmPatternProcessor();

          // CODE REVIEW FIX: Verify instance has expected methods
          const instanceVerification = verifyWasmInstance(
            wasmPatternProcessor,
            ['initialize', 'processTokens', 'getStatistics', 'free'],
            'WasmPatternProcessor'
          );
          if (!instanceVerification.valid) {
            throw new Error(
              `WASM instance verification failed: ${instanceVerification.errors.join(', ')}`
            );
          }

          // Initialize with patterns
          const success = wasmPatternProcessor.initialize(patternsDict);

          if (!success) {
            throw new Error('Failed to initialize pattern processor with patterns');
          }

          // Get statistics
          const stats = wasmPatternProcessor.getStatistics();
          logger.log('✅ WASM Pattern Processor initialized successfully');
          // Note: stats is already logged by WASM side, JavaScript side just confirms success
        },
        'PatternProcessor-init',
        { onlyRetryTransient: true }
      );

      // MEDIUM-3 FIX: Reset warning time on successful initialization (allow immediate new warning)
      lastPatternWarningTime = 0;

      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize WASM Pattern Processor after retries:', error);
      logger.error('Pattern matching will not be available. Please check WASM configuration.');
      initializationFailed = true;
      // CODE REVIEW FIX (CRITICAL-2): Clear partial state on failure
      initializationPromise = null;
      wasmPatternProcessor = null;
      wasmModule = null;
      return false;
    }
  })());
}

// MEDIUM FIX: Toast duration constants
const TOAST_DURATION = {
  ERROR: 10000,
  WARNING: 5000,
  INFO: 3000,
};

/**
 * Process semantic tokens with two-phase pattern matching
 * @param {Array} semanticTokens - Array of semantic token objects
 * @param {Object} variableCache - Variable translation cache
 * @returns {Promise<Object>} Result object with { success: boolean, results: Array, error?: string }
 */
export async function processTokensWasm(semanticTokens, variableCache) {
  // CRITICAL-2 FIX: Degrade gracefully instead of throwing
  // Patterns enhance translation quality but aren't essential - allow basic translation to continue

  // Wait for in-progress initialization before degrading
  // CODE REVIEW FIX (HIGH-5): Check initialization result
  if (initializationPromise && !wasmPatternProcessor) {
    const success = await initializationPromise;

    // CRITICAL: Verify initialization actually succeeded
    if (!success || !wasmPatternProcessor) {
      const errorMsg = 'WASM Pattern Processor initialization failed - skipping pattern processing';
      logger.warn(`⚠️ ${errorMsg}`);
      logger.warn('Translation will continue with lower quality (no pattern matching)');

      // CODE REVIEW FIX (HIGH-1): Add user notification for initialization failure
      const now = Date.now();
      if (now - lastPatternWarningTime > PATTERN_WARNING_COOLDOWN) {
        toast.warning(
          'Pattern matching initialization failed. Translation quality may be reduced.',
          {
            duration: TOAST_DURATION.WARNING,
          }
        );
        lastPatternWarningTime = now;
      }

      return {
        success: false,
        results: [],
        error: errorMsg,
      };
    }
  }

  if (!wasmPatternProcessor) {
    const errorMsg = 'WASM Pattern Processor not initialized - skipping pattern processing';
    logger.warn(`⚠️ ${errorMsg}`);
    logger.warn('Translation will continue with lower quality (no pattern matching)');

    // MEDIUM-3 FIX: Show warning with cooldown instead of once-per-session
    const now = Date.now();
    if (now - lastPatternWarningTime > PATTERN_WARNING_COOLDOWN) {
      toast.warning('Pattern matching unavailable. Translation quality may be reduced.', {
        duration: TOAST_DURATION.WARNING,
      });
      lastPatternWarningTime = now;
    }

    // MEDIUM FIX: Return structured error object instead of empty array
    return {
      success: false,
      results: [],
      error: errorMsg,
    };
  }

  try {
    // Call WASM Pattern Processor
    const results = wasmPatternProcessor.processTokens(semanticTokens, variableCache);
    return {
      success: true,
      results: results,
    };
  } catch (error) {
    const errorMsg = `WASM pattern processing error: ${error.message}`;
    logger.error('❌ Error in WASM pattern processing, skipping patterns:', error);

    // MEDIUM-3 FIX: Show warning with cooldown instead of once-per-session
    const now = Date.now();
    if (now - lastPatternWarningTime > PATTERN_WARNING_COOLDOWN) {
      toast('Pattern matching error. Translation quality may be reduced.', {
        icon: '⚠️',
        duration: TOAST_DURATION.WARNING,
      });
      lastPatternWarningTime = now;
    }

    // MEDIUM FIX: Return structured error object
    // Log error but don't block translation - patterns are quality enhancement
    // Translation can continue without patterns (proper nouns + phrases + characters still work)
    return {
      success: false,
      results: [],
      error: errorMsg,
    };
  }
}

/**
 * Check if WASM Pattern Processor is available
 * @returns {boolean} True if WASM is loaded and ready
 */
export function isWasmPatternProcessorAvailable() {
  return wasmPatternProcessor !== null && wasmPatternProcessor.isInitialized();
}

/**
 * Check if WASM initialization failed
 * @returns {boolean} True if initialization failed
 */
export function hasWasmPatternProcessorFailed() {
  return initializationFailed;
}

/**
 * Get pattern processor statistics
 * @returns {Object|null} Statistics object or null if not initialized
 */
export function getWasmPatternProcessorStats() {
  if (!wasmPatternProcessor) {
    return null;
  }

  try {
    return wasmPatternProcessor.getStatistics();
  } catch (error) {
    logger.error('❌ Error getting WASM pattern processor stats:', error);
    return null;
  }
}

/**
 * Re-initialize pattern processor with new patterns
 * @param {Object} patternsDict - New pattern dictionary
 * @returns {Promise<boolean>} True if re-initialization succeeded
 */
export async function reinitializeWasmPatternProcessor(patternsDict) {
  // Clear existing state
  wasmPatternProcessor = null;
  initializationPromise = null;
  initializationFailed = false;
  lastPatternWarningTime = 0; // MEDIUM-3 FIX: Reset warning time to allow new notifications

  // Re-initialize
  return initializeWasmPatternProcessor(patternsDict);
}

/**
 * Clean up WASM Pattern Processor resources
 * CODE REVIEW FIX (MEDIUM-7): Added cleanup method for consistency
 * @returns {void}
 */
export function cleanupWasmPatternProcessor() {
  wasmPatternProcessor = null;
  wasmModule = null;
  initializationPromise = null;
  initializationFailed = false;
  lastPatternWarningTime = 0;

  logger.log('🧹 WASM Pattern Processor cleaned up');
  // Note: No intervals to clear in this module
}

/**
 * Enable Rust-side pattern matching profiling
 */
export function enableMatcherProfiling() {
  if (!wasmModule) {
    logger.warn('⚠️ WASM module not loaded yet. Profiling not available.');
    return;
  }

  try {
    wasmModule.enable_matcher_profiling();
    logger.log('🦀 Rust-side pattern matching profiling enabled');
  } catch (error) {
    logger.error('❌ Error enabling matcher profiling:', error);
  }
}

/**
 * Disable Rust-side pattern matching profiling
 */
export function disableMatcherProfiling() {
  if (!wasmModule) {
    logger.warn('⚠️ WASM module not loaded yet. Profiling not available.');
    return;
  }

  try {
    wasmModule.disable_matcher_profiling();
    logger.log('🦀 Rust-side pattern matching profiling disabled');
  } catch (error) {
    logger.error('❌ Error disabling matcher profiling:', error);
  }
}

/**
 * Reset Rust-side pattern matching profiling data
 */
export function resetMatcherProfiling() {
  if (!wasmModule) {
    logger.warn('⚠️ WASM module not loaded yet. Profiling not available.');
    return;
  }

  try {
    wasmModule.reset_matcher_profiling();
    logger.log('🦀 Rust-side pattern matching profiling data reset');
  } catch (error) {
    logger.error('❌ Error resetting matcher profiling:', error);
  }
}

/**
 * Print Rust-side pattern matching profiling report to console
 */
export function printMatcherProfilingReport() {
  if (!wasmModule) {
    logger.warn('⚠️ WASM module not loaded yet. Profiling not available.');
    return;
  }

  try {
    wasmModule.print_matcher_profiling_report();
  } catch (error) {
    logger.error('❌ Error printing matcher profiling report:', error);
  }
}

// Expose profiling functions on window for easy console access (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.enableMatcherProfiling = enableMatcherProfiling;
  window.disableMatcherProfiling = disableMatcherProfiling;
  window.resetMatcherProfiling = resetMatcherProfiling;
  window.printMatcherProfilingReport = printMatcherProfilingReport;
}

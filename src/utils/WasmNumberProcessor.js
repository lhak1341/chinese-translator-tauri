/**
 * WASM Number Processor Wrapper
 * Provides a JavaScript interface to the Rust/WASM NumberProcessor
 *
 * Features:
 * - Converts Chinese numbers to Arabic numerals
 * - Handles compound numbers (三十五 → 35)
 * - Processes years (一九四五年 → năm 1945)
 * - Handles percentages (百分之三十 → 30%)
 * - Supports number ranges (五六十 → 50-60)
 *
 * Fallback: If WASM fails to load, returns tokens unchanged (numbers translated character-by-character)
 */

import toast from './toast';
import { logger } from './logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';

let wasmModule = null;
let wasmNumberProcessor = null;
let initializationPromise = null;
let initializationFailed = false;
let showedNumberWarning = false;

/**
 * Initialize the WASM NumberProcessor
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export async function initializeWasmNumberProcessor() {
  // Return cached result if already initialized or failed
  if (wasmNumberProcessor) {
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
      logger.log('🔢 Initializing WASM NumberProcessor...');

      // Dynamically import the WASM module
      wasmModule = await import('../wasm/translation_wasm_core.js');

      // Initialize WASM
      await wasmModule.default();

      // Create NumberProcessor instance
      wasmNumberProcessor = new wasmModule.NumberProcessor();

      logger.log('✅ WASM NumberProcessor initialized successfully');

      // Reset warning flag on successful initialization
      showedNumberWarning = false;

      return true;
    } catch (error) {
      logger.warn('⚠️ Failed to initialize WASM NumberProcessor:', error);
      logger.warn('Falling back to character-by-character translation for numbers');
      initializationFailed = true;
      return false;
    }
  })());
}

/**
 * Process tokens to convert Chinese numbers
 * @param {Array} tokens - Array of token objects
 * @returns {Promise<Array>} Processed tokens
 */
/**
 * Categorize WASM error types for better diagnostics
 * CODE REVIEW FIX (HIGH-4): Improve error handling with categorization
 */
function categorizeWasmError(error) {
  const message = error.message || String(error);

  if (message.includes('validation') || message.includes('undefined')) {
    return {
      type: 'validation',
      userMessage: 'Number data validation failed',
      shouldReport: true, // Report to error tracking
    };
  }

  if (message.includes('serialization') || message.includes('parse') || message.includes('JSON')) {
    return {
      type: 'serialization',
      userMessage: 'Number data format error',
      shouldReport: true,
    };
  }

  if (message.includes('WASM') || message.includes('memory')) {
    return {
      type: 'wasm_runtime',
      userMessage: 'Number processor runtime error',
      shouldReport: true,
    };
  }

  return {
    type: 'unknown',
    userMessage: 'Number processing error',
    shouldReport: true,
  };
}

export async function processNumbersWasm(tokens) {
  // Ensure WASM is initialized
  if (!wasmNumberProcessor) {
    const success = await initializeWasmNumberProcessor();
    if (!success) {
      // One-time notification for initialization failure
      if (!showedNumberWarning) {
        toast.warning(
          'Number processing unavailable. Numbers will translate character-by-character.',
          {
            duration: TOAST_DURATIONS.LOAD_FAILURE,
            id: TOAST_IDS.WASM_NUMBER_FALLBACK,
          }
        );
        showedNumberWarning = true;
      }

      // WASM failed - return tokens unchanged
      return tokens;
    }
  }

  try {
    // Call WASM NumberProcessor
    const processedTokens = wasmNumberProcessor.processTokens(tokens);
    return processedTokens;
  } catch (error) {
    // CODE REVIEW FIX (HIGH-4): Categorize errors for better debugging
    const errorInfo = categorizeWasmError(error);

    logger.error(`❌ WASM number processing ${errorInfo.type} error:`, error);

    // Report to error tracking if needed (Sentry, etc.)
    if (errorInfo.shouldReport && typeof window !== 'undefined' && window.errorTracker) {
      window.errorTracker.captureException(error, {
        tags: { component: 'wasm_number_processor', error_type: errorInfo.type },
      });
    }

    // One-time notification for processing errors with specific message
    if (!showedNumberWarning) {
      const detailedMessage = `${errorInfo.userMessage}. Numbers will translate character-by-character.`;
      toast.warning(detailedMessage, {
        duration: TOAST_DURATIONS.LOAD_FAILURE,
        id: TOAST_IDS.WASM_NUMBER_FALLBACK,
      });
      showedNumberWarning = true;
    }

    // Fallback: return tokens unchanged
    return tokens;
  }
}

/**
 * Check if WASM NumberProcessor is available
 * @returns {boolean} True if WASM is loaded and ready
 */
export function isWasmNumberProcessorAvailable() {
  return wasmNumberProcessor !== null;
}

/**
 * Check if WASM initialization failed
 * @returns {boolean} True if initialization failed
 */
export function hasWasmNumberProcessorFailed() {
  return initializationFailed;
}

/**
 * Get WASM NumberProcessor status
 * @returns {Object} Status information
 */
export function getWasmNumberProcessorStatus() {
  return {
    available: wasmNumberProcessor !== null,
    failed: initializationFailed,
    initializing: initializationPromise !== null && wasmNumberProcessor === null,
  };
}

/**
 * Re-initialize WASM NumberProcessor
 * @returns {Promise<boolean>} True if re-initialization succeeded
 */
export async function reinitializeWasmNumberProcessor() {
  // Clear existing state
  wasmNumberProcessor = null;
  initializationPromise = null;
  initializationFailed = false;
  showedNumberWarning = false; // Reset warning flag to allow new notifications

  // Re-initialize
  return initializeWasmNumberProcessor();
}

// Auto-initialize on import (non-blocking)
initializeWasmNumberProcessor().catch((err) => {
  logger.warn('Background WASM NumberProcessor initialization failed:', err);
  initializationFailed = true; // Mark initialization as failed to prevent retries
});

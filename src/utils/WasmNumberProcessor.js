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
      console.log('🔢 Initializing WASM NumberProcessor...');

      // Dynamically import the WASM module
      wasmModule = await import('../wasm/translation_wasm_core.js');

      // Initialize WASM
      await wasmModule.default();

      // Create NumberProcessor instance
      wasmNumberProcessor = new wasmModule.NumberProcessor();

      console.log('✅ WASM NumberProcessor initialized successfully');

      // Reset warning flag on successful initialization
      showedNumberWarning = false;

      return true;
    } catch (error) {
      console.warn('⚠️ Failed to initialize WASM NumberProcessor:', error);
      console.warn('Falling back to character-by-character translation for numbers');
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
export async function processNumbersWasm(tokens) {
  // Ensure WASM is initialized
  if (!wasmNumberProcessor) {
    const success = await initializeWasmNumberProcessor();
    if (!success) {
      // One-time notification for initialization failure
      if (!showedNumberWarning) {
        toast.warning(
          'Number processing unavailable. Numbers will translate character-by-character.',
          { duration: 5000 }
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
    console.error('❌ Error in WASM number processing:', error);

    // One-time notification for processing errors
    if (!showedNumberWarning) {
      toast.warning('Number processing error. Numbers will translate character-by-character.', {
        duration: 5000,
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
  console.warn('Background WASM NumberProcessor initialization failed:', err);
  initializationFailed = true; // Mark initialization as failed to prevent retries
});

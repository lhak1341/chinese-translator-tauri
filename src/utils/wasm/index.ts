/**
 * WASM subsystem public API.
 *
 * Primary entry points:
 *   - WasmNumberProcessor  — phase 3 (number_conversion)
 *   - WasmPatternProcessor — phase 1 (pattern matching)
 *   - WasmBoundaryValidation — copyWasmTokens, validateWasm*
 *   - wasmTextAssembler / wasmTextChunker / WasmTextTokenizer — pipeline I/O
 *
 * Infrastructure (used internally by TranslationEngine):
 *   - wasmErrorHandler, wasmRetryManager, WasmMemoryPool, wasmBinaryCache
 */

// --- Boundary validation (WASM ↔ JS data contracts) ---
export type { WasmToken } from './WasmBoundaryValidation';
export {
  copyWasmTokens,
  validateWasmToken,
  validateWasmPatternMatch,
  validateWasmDictionaryMatch,
  validateRustLookupMatch,
  isMetadataSizeValid,
  MAX_WASM_METADATA_SIZE,
} from './WasmBoundaryValidation';

// --- Conflict resolution (phase 4) ---
export { resolveGlobalConflictsWasm } from './WasmConflictResolution';

// --- Number processor (phase 3) ---
export {
  initializeWasmNumberProcessor,
  processNumbersWasm,
  isWasmNumberProcessorAvailable,
  hasWasmNumberProcessorFailed,
  getWasmNumberProcessorStatus,
  reinitializeWasmNumberProcessor,
  cleanupWasmNumberProcessor,
} from './WasmNumberProcessor';

// --- Pattern processor (phase 1) ---
export {
  initializeWasmPatternProcessor,
  processTokensWasm,
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
  getWasmPatternProcessorStats,
  reinitializeWasmPatternProcessor,
  cleanupWasmPatternProcessor,
  enableMatcherProfiling,
  disableMatcherProfiling,
  resetMatcherProfiling,
  printMatcherProfilingReport,
} from './WasmPatternProcessor';

// --- Text pipeline ---
export { WasmTextTokenizer, isWasmTextTokenizerSupported } from './WasmTextTokenizer';
export { WasmTextChunker, wasmTextChunker } from './WasmTextChunker';
export {
  WasmTextAssemblerWrapper,
  createWasmTextAssembler,
  needsSpace,
  wasmTextAssembler,
} from './WasmTextAssembler';
export { WasmStringProcessor, wasmStringProcessor } from './WasmStringProcessor';

// --- Dictionary trie ---
export { WasmDictionaryTrieWrapper, createWasmDictionaryTrie } from './WasmDictionaryTrie';
export { WasmDictionaryManager } from './WasmDictionaryManager';
export {
  WasmDictionaryTrieValidator,
  validateWasmDictionaryTrie,
} from './WasmDictionaryTrieValidator';

// --- Regex ---
export { WasmRegexUtilsWrapper, createWasmRegexUtils } from './WasmRegexUtils';

// --- Infrastructure ---
export {
  TimeoutError,
  DEFAULT_WASM_TIMEOUTS,
  callWasmWithTimeout,
  createTimeoutWrapper,
  TimeoutManager,
} from './wasmOperationTimeout';

export {
  categorizeWasmError,
  createWasmErrorHandler,
  formatWasmError,
  shouldEnterFallback,
} from './wasmErrorHandler';

export {
  verifyWasmModule,
  verifyWasmInstance,
  verifyWasmBinaryIntegrity,
} from './wasmIntegrityVerifier';

export { fetchWasmBinary, clearWasmBinaryCache, getWasmBinaryCacheStats } from './wasmBinaryCache';

export { default as WasmRetryManager, wasmRetryManager } from './WasmRetryManager';

export type {
  PoolCategory,
  WasmMemoryPoolOptions,
  BufferMetadata,
  PoolConfig,
  PoolStats,
  MemoryPoolStats,
  OptimizationRecommendation,
  OperationStats,
  CombinedStats,
} from './WasmMemoryPoolManager';
export {
  WasmMemoryPool,
  WasmDictionaryOperationHelper,
  wasmMemoryPoolManager,
} from './WasmMemoryPoolManager';

/**
 * TypeScript type definitions for WASM boundary types
 *
 * Defines interfaces for WebAssembly integration, including Rust engine bindings,
 * dictionary loading, number processing, and memory management.
 *
 * IMPORTANT: These types represent the JavaScript-WASM boundary.
 * Type mismatches can cause serialization errors and memory safety violations.
 */

/**
 * A token at the WASM-JavaScript boundary
 * Used by validateWasmToken and copyWasmTokens
 */
export interface WasmToken {
  /** Token type (e.g., 'chinese_char', 'punctuation') */
  type: string;

  /** Source text value */
  value: string;

  /** Translation result, or null for consumed/untranslated tokens */
  translated: string | null;

  /** Translation phase that produced this token, or null if untranslated */
  translationSource: string | null;
}

/**
 * WASM translation result from Rust engine
 * Returned by process_chinese_numbers() and other WASM functions
 */
export interface WasmTranslationResult {
  /** Translated text */
  translated_text: string;

  /** Number of tokens processed */
  tokens_processed: number;

  /** Execution time in milliseconds */
  execution_time_ms: number;

  /** Whether fallback to JavaScript occurred */
  used_fallback?: boolean;

  /** Error message if translation failed */
  error?: string;
}

/**
 * WASM dictionary entry format
 * Format expected by Rust engine for dictionary loading
 */
export interface WasmDictionaryEntry {
  /** Source text (Chinese) */
  source: string;

  /** Translation text (Vietnamese) */
  translation: string;

  /** Serialized metadata (JSON string or null) */
  metadata: string | null;
}

/**
 * WASM dictionary trie interface
 * Rust-based trie for O(k) dictionary lookups
 */
export interface WasmDictionaryTrie {
  /**
   * Find longest match starting at position
   * @param text - Input text
   * @param start_index - Starting position
   * @returns Match result or null
   */
  find_longest_match(text: string, start_index: number): WasmMatchResult | null;

  /**
   * Find all matches starting at position
   * @param text - Input text
   * @param start_index - Starting position
   * @returns Array of match results
   */
  find_all_matches(text: string, start_index: number): WasmMatchResult[];

  /**
   * Insert entry into trie
   * @param key - Dictionary key
   * @param value - Translation value
   * @param metadata - Optional metadata (JSON string)
   */
  insert(key: string, value: string, metadata?: string): void;

  /**
   * Clear all entries from trie
   */
  clear(): void;

  /**
   * Get trie statistics
   * @returns Trie size and memory usage
   */
  get_stats(): WasmTrieStats;
}

/**
 * WASM match result from trie lookup
 * Returned by find_longest_match() and find_all_matches()
 */
export interface WasmMatchResult {
  /** Matched text from source */
  matched_text: string;

  /** Translation */
  translation: string;

  /** Match length in characters */
  length: number;

  /** End position in source text */
  end_pos?: number;

  /** Parsed metadata object (JSON deserialized from Rust) */
  metadata?: Record<string, unknown> | null;
}

/**
 * WASM trie statistics
 * Memory and performance metrics for WASM trie
 */
export interface WasmTrieStats {
  /** Total entries in trie */
  entry_count: number;

  /** Memory usage in bytes */
  memory_bytes: number;

  /** Average lookup time in microseconds */
  avg_lookup_time_us?: number;

  /** Node count */
  node_count?: number;
}

/**
 * Core Translation Engine (Rust WASM)
 * Main WASM engine class exposed from wasm-core
 */
export interface CoreTranslationEngine {
  /**
   * Load dictionary into Rust engine
   * @param name - Dictionary name
   * @param entries - Array of [source, translation, metadata] tuples
   */
  load_dictionary(name: string, entries: [string, string, string | null][]): void;

  /**
   * Optimized batch dictionary loading
   * @param dictionaries_json - JSON string of all dictionaries
   */
  load_dictionaries_batch(dictionaries_json: string): void;

  /**
   * Process Chinese numbers with WASM acceleration
   * @param text - Input text with Chinese numbers
   * @returns Translation result
   */
  process_chinese_numbers(text: string): WasmTranslationResult;

  /**
   * Translate text using 5-phase pipeline
   * @param text - Input text
   * @param options_json - JSON string of translation options
   * @returns Translation result
   */
  translate(text: string, options_json: string): WasmTranslationResult;

  /**
   * Enable/disable debug logging in Rust
   * @param enabled - Debug flag
   */
  set_debug_enabled(enabled: boolean): void;

  /**
   * Get WASM engine statistics
   * @returns Performance and memory stats
   */
  get_stats(): WasmEngineStats;

  /**
   * Clear all loaded dictionaries
   */
  clear_dictionaries(): void;

  /**
   * Free WASM memory (call when done)
   */
  free(): void;
}

/**
 * WASM engine statistics
 * Performance metrics from Rust engine
 */
export interface WasmEngineStats {
  /** Total translations performed */
  total_translations: number;

  /** Total execution time in milliseconds */
  total_time_ms: number;

  /** Average translation time */
  avg_time_ms: number;

  /** Memory allocated in bytes */
  memory_allocated: number;

  /** Dictionary count */
  dictionary_count: number;

  /** Total dictionary entries */
  total_entries: number;
}

/**
 * WASM initialization options
 * Configuration for init() function
 */
export interface WasmInitOptions {
  /** Path to WASM file */
  module?: string | URL;

  /** Memory configuration */
  memory?: WebAssembly.Memory;

  /** Initial memory pages (64KB each) */
  initial?: number;

  /** Maximum memory pages */
  maximum?: number;
}

/**
 * WASM memory buffer
 * Pre-allocated buffer from memory pool
 */
export interface WasmMemoryBuffer {
  /** Buffer size category */
  size: 'small' | 'medium' | 'large';

  /** Actual byte length */
  byteLength: number;

  /** Underlying ArrayBuffer */
  buffer: ArrayBuffer;

  /** Whether buffer is currently in use */
  inUse: boolean;

  /** Last used timestamp */
  lastUsed?: number;

  /** Buffer ID for tracking */
  id?: string;
}

/**
 * WASM memory pool manager interface
 * Manages pre-allocated WASM buffers for efficiency
 */
export interface WasmMemoryPoolManager {
  /** Small buffer pool (< 1KB) */
  smallBuffers: WasmMemoryBuffer[];

  /** Medium buffer pool (1-10KB) */
  mediumBuffers: WasmMemoryBuffer[];

  /** Large buffer pool (> 10KB) */
  largeBuffers: WasmMemoryBuffer[];

  /** Pool statistics */
  stats: {
    totalAllocations: number;
    poolHits: number;
    poolMisses: number;
    hitRate: number;
  };

  /**
   * Get buffer from pool or allocate new
   * @param sizeBytes - Required size in bytes
   * @returns Buffer from pool or new allocation
   */
  getBuffer(sizeBytes: number): WasmMemoryBuffer;

  /**
   * Return buffer to pool for reuse
   * @param buffer - Buffer to return
   */
  releaseBuffer(buffer: WasmMemoryBuffer): void;

  /**
   * Clear all pooled buffers
   */
  clearPool(): void;

  /**
   * Get pool statistics
   * @returns Pool performance metrics
   */
  getStats(): {
    totalAllocations: number;
    poolHits: number;
    poolMisses: number;
    hitRate: number;
    currentPoolSize: number;
    totalPoolMemory: number;
  };
}

/**
 * WASM translation accelerator interface
 * JavaScript wrapper around Rust CoreTranslationEngine
 */
export interface WasmTranslationAccelerator {
  /** Rust engine instance */
  rustEngine: CoreTranslationEngine | null;

  /** Fallback JavaScript engine (TranslationEngine instance) */
  fallbackEngine: unknown;

  /** Whether WASM is initialized */
  initialized: boolean;

  /** Whether using fallback mode */
  fallbackMode: boolean;

  /** Performance statistics */
  performanceStats: {
    rustTranslations: number;
    jsTranslations: number;
    totalRustTime: number;
    totalJsTime: number;
    averageSpeedup: number;
  };

  /**
   * Initialize WASM engine
   * @returns Success status
   */
  initialize(): Promise<boolean>;

  /**
   * Load dictionaries into Rust engine
   * @param dictionaries - Dictionary data (dictionary name -> entries array)
   * @returns Success status
   */
  loadDictionaries(dictionaries: Record<string, WasmDictionaryEntry[]>): Promise<boolean>;

  /**
   * Optimized batch dictionary loading (single boundary crossing)
   * @param dictionaries - Dictionary data (dictionary name -> entries array)
   * @returns Success status
   */
  loadDictionariesOptimized(dictionaries: Record<string, WasmDictionaryEntry[]>): Promise<boolean>;

  /**
   * Process Chinese numbers with WASM
   * @param text - Input text
   * @param options - Processing options
   * @returns Processed result
   */
  processChineseNumbers(
    text: string,
    options?: WasmNumberProcessingOptions
  ): Promise<WasmTranslationResult>;

  /**
   * Translate text using WASM
   * @param text - Input text
   * @param options - Translation options (JSON-serializable)
   * @returns Translation result with semantic arrays
   */
  translate(text: string, options?: Record<string, unknown>): Promise<WasmTranslationResult>;

  /**
   * Get performance statistics
   * @returns Performance stats
   */
  getPerformanceStats(): {
    rustTranslations: number;
    jsTranslations: number;
    totalRustTime: number;
    totalJsTime: number;
    averageSpeedup: number;
    wasmInitialized: boolean;
    fallbackMode: boolean;
  };
}

/**
 * WASM module initialization function
 * Exported from wasm-core/translation_wasm_core.js
 */
export interface WasmInit {
  /**
   * Initialize WASM module
   * @param options - Initialization options
   * @returns Promise that resolves when WASM is ready
   */
  (options?: WasmInitOptions | string | URL): Promise<void>;
}

/**
 * WASM error types
 * Errors that can occur during WASM operations
 */
export type WasmErrorType =
  | 'initialization_failed'
  | 'dictionary_load_failed'
  | 'translation_failed'
  | 'memory_allocation_failed'
  | 'serialization_failed'
  | 'unsupported_operation';

/**
 * WASM error interface
 * Structured error from WASM operations
 */
export interface WasmError {
  /** Error type */
  type: WasmErrorType;

  /** Error message */
  message: string;

  /** Rust error details (if available) */
  rustError?: string;

  /** Stack trace */
  stack?: string;

  /** Whether fallback was attempted */
  fallbackAttempted?: boolean;
}

/**
 * Number processing options for WASM
 * Configuration for process_chinese_numbers()
 */
export interface WasmNumberProcessingOptions {
  /** Enable debug output */
  debug?: boolean;

  /** Use traditional number characters */
  useTraditional?: boolean;

  /** Custom number mappings */
  customMappings?: Record<string, string>;
}

/**
 * WASM benchmark result
 * Performance comparison between WASM and JavaScript
 */
export interface WasmBenchmarkResult {
  /** Operation benchmarked */
  operation: string;

  /** WASM execution time (ms) */
  wasmTime: number;

  /** JavaScript execution time (ms) */
  jsTime: number;

  /** Speedup factor (jsTime / wasmTime) */
  speedup: number;

  /** Sample size */
  iterations: number;

  /** Statistical confidence (0-1) */
  confidence?: number;
}

/**
 * Centralized Type Definitions for Translation App
 *
 * This file contains JSDoc type definitions for core data structures used throughout
 * the application. These types can be imported into other files for consistent typing.
 *
 * Usage:
 * ```javascript
 * // Import specific type
 * /** @typedef {import('./types').SemanticUnit} SemanticUnit *\/
 *
 * // Use in function signature
 * /** @param {SemanticUnit[]} units *\/
 * function processUnits(units) { ... }
 * ```
 */

// ============================================================================
// SEMANTIC ARRAYS & TRANSLATION STRUCTURES
// ============================================================================

/**
 * A single semantic unit representing a translation segment with position mapping
 * between original and translated text. Critical for clickable highlighting.
 *
 * @typedef {Object} SemanticUnit
 * @property {number} originalStart - Start character position in original Chinese text (0-indexed)
 * @property {number} originalEnd - End character position in original Chinese text (exclusive)
 * @property {number} translatedStart - Start character position in Vietnamese translation (0-indexed)
 * @property {number} translatedEnd - End character position in Vietnamese translation (exclusive)
 * @property {string} originalText - Original Chinese text segment
 * @property {string} translatedText - Vietnamese translation segment
 * @property {number} [phase] - Translation phase (1=Pattern, 2=ProperNoun, 3=Number, 4=Phrase, 5=Character)
 * @property {string} [type] - Semantic type (e.g., 'pattern', 'properNoun', 'phrase', 'character')
 * @property {Object} [metadata] - Additional metadata about the translation
 */

/**
 * Container for semantic units array with position mapping data
 *
 * @typedef {Object} SemanticArrays
 * @property {SemanticUnit[]} units - Array of semantic units
 * @property {number} [totalOriginalLength] - Total length of original text
 * @property {number} [totalTranslatedLength] - Total length of translated text
 */

/**
 * Prebuilt segment for optimized rendering (instant segments built during translation)
 *
 * @typedef {Object} PrebuiltSegment
 * @property {string} text - Segment text content
 * @property {number} unitIndex - Corresponding semantic unit index
 * @property {boolean} [isHighlighted] - Whether segment is currently highlighted
 */

// ============================================================================
// TRANSLATION OPTIONS & CONFIGURATION
// ============================================================================

/**
 * Options for translation operations
 *
 * @typedef {Object} TranslationOptions
 * @property {boolean} [progressive] - Use progressive batch translation for large texts
 * @property {(data: ProgressData) => void} [onProgress] - Callback for translation progress updates
 * @property {string[]} [activeProperNouns] - List of active proper noun dictionary IDs
 * @property {boolean} [preserveFormatting] - Preserve original text formatting
 * @property {boolean} [characterOnly] - Translate using character dictionary only (no phrases/patterns)
 * @property {number} [batchSize] - Number of chunks per batch (default: 10)
 * @property {boolean} [enableStreaming] - Enable streaming translation UI updates
 */

/**
 * Progress data for translation operations
 *
 * @typedef {Object} ProgressData
 * @property {number} completedChunks - Number of completed translation chunks
 * @property {number} totalChunks - Total number of chunks to translate
 * @property {string} partialText - Partial translated text so far
 * @property {number} progress - Progress percentage (0-100)
 * @property {number} [currentBatch] - Current batch number (for batch translation)
 * @property {number} [totalBatches] - Total number of batches
 * @property {number} [avgTimePerChunk] - Average time per chunk in milliseconds
 * @property {SemanticArrays} [partialSemanticArrays] - Partial semantic arrays for incremental UI
 */

/**
 * Result of translation operation
 *
 * @typedef {Object} TranslationResult
 * @property {string} originalText - Original Chinese text
 * @property {string} translatedText - Vietnamese translation
 * @property {SemanticArrays} semanticArrays - Semantic arrays with position mapping
 * @property {Array} segments - Internal translation segments (for debugging)
 * @property {PrebuiltSegment[]} [prebuiltSegments] - Prebuilt segments for instant rendering
 * @property {number} [startTime] - Translation start timestamp
 * @property {number} [duration] - Translation duration in milliseconds
 */

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Performance statistics for translation operations
 *
 * @typedef {Object} PerformanceStats
 * @property {number} operations - Total number of operations performed
 * @property {number} avgTime - Average operation time in milliseconds
 * @property {number} cacheHitRate - Cache hit rate percentage (0-100)
 * @property {number} [minTime] - Minimum operation time in milliseconds
 * @property {number} [maxTime] - Maximum operation time in milliseconds
 * @property {number} [totalTime] - Total accumulated time in milliseconds
 */

/**
 * Performance regression health status
 *
 * @typedef {Object} RegressionHealth
 * @property {'healthy' | 'warning' | 'critical'} status - Overall health status
 * @property {number} criticalAlerts - Number of critical performance alerts
 * @property {number} warningAlerts - Number of warning performance alerts
 * @property {number} baselines - Number of established performance baselines
 * @property {string[]} [recommendations] - Recommended actions for degraded performance
 */

// ============================================================================
// WASM & ENGINE STATUS
// ============================================================================

/**
 * WASM engine status and configuration
 *
 * @typedef {Object} WasmStatus
 * @property {boolean} initialized - Whether WASM module is initialized
 * @property {boolean} fallbackMode - Whether running in JavaScript fallback mode
 * @property {number} totalEntries - Total dictionary entries loaded in WASM
 * @property {string} [version] - WASM module version
 * @property {boolean} [available] - Whether WASM is available in browser
 * @property {string} [error] - Error message if WASM initialization failed
 */

/**
 * Translation engine initialization status
 *
 * @typedef {Object} EngineStatus
 * @property {boolean} initialized - Whether translation engine is initialized
 * @property {boolean} dictionariesLoaded - Whether dictionaries are loaded
 * @property {number} activeTranslations - Number of concurrent active translations
 * @property {WasmStatus} [wasmStatus] - WASM-specific status
 * @property {string[]} [loadedDictionaries] - List of loaded dictionary IDs
 */

// ============================================================================
// STREAMING TRANSLATION STATE
// ============================================================================

/**
 * Streaming translation state for progressive UI updates
 *
 * @typedef {Object} StreamingTranslationState
 * @property {string} partialText - Partial translated text during streaming
 * @property {number} progress - Progress percentage (0-100)
 * @property {boolean} isStreaming - Whether streaming translation is active
 * @property {number} completedChunks - Number of completed chunks
 * @property {number} totalChunks - Total number of chunks
 * @property {number} batchNumber - Current batch number
 * @property {number} avgTimePerChunk - Average time per chunk in milliseconds
 */

/**
 * Progress information for batch translation
 *
 * @typedef {Object} ProgressInfo
 * @property {number} currentBatch - Current batch number (1-indexed)
 * @property {number} totalBatches - Total number of batches
 * @property {number} completedChunks - Number of completed chunks
 * @property {number} totalChunks - Total number of chunks
 * @property {number} [batchProgress] - Progress within current batch (0-100)
 */

// ============================================================================
// DICTIONARY CONFIGURATION
// ============================================================================

/**
 * Dictionary entry structure
 *
 * @typedef {Object} DictionaryEntry
 * @property {string} source - Original Chinese text
 * @property {string} translation - Vietnamese translation
 * @property {boolean} [allowAsPatternVariable] - Whether entry can be used as pattern variable
 * @property {boolean} [lowPriority] - Whether entry has low priority in pattern matching
 * @property {string} [notes] - Optional notes about the entry
 */

/**
 * Dictionary metadata and configuration
 *
 * @typedef {Object} DictionaryConfig
 * @property {string} id - Dictionary identifier
 * @property {string} name - Human-readable dictionary name
 * @property {string} type - Dictionary type ('characters', 'phrases', 'patterns', 'properNouns', etc.)
 * @property {boolean} active - Whether dictionary is currently active
 * @property {number} [entryCount] - Number of entries in dictionary
 * @property {string} [filePath] - Path to dictionary JSON file
 */

// ============================================================================
// UI COMPONENT PROPS
// ============================================================================

/**
 * Style object for text display areas (memoized)
 *
 * @typedef {Object} TextAreaStyle
 * @property {string} [fontSize] - Font size (e.g., '16px', '1rem')
 * @property {string} [padding] - Padding (e.g., '1rem')
 * @property {string} [backgroundColor] - Background color
 * @property {string} [border] - Border style
 * @property {string} [borderRadius] - Border radius
 * @property {string} [overflow] - Overflow behavior
 * @property {string} [flex] - Flex sizing
 * @property {number} [minHeight] - Minimum height in pixels
 */

/**
 * Highlighting state for clickable segments
 *
 * @typedef {Object} HighlightState
 * @property {number | null} highlightedUnitIndex - Highlighted unit in original text
 * @property {number | null} highlightedTranslationUnitIndex - Highlighted unit in main translation
 * @property {number | null} highlightedCharacterOnlyUnitIndex - Highlighted unit in character-only translation
 * @property {boolean} isCharacterOnlyClick - Whether click originated from character-only panel
 */

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Translation error with context
 *
 * @typedef {Object} TranslationError
 * @property {string} message - Error message
 * @property {string} code - Error code (e.g., 'DICT_LOAD_FAILED', 'WASM_INIT_FAILED')
 * @property {string} [phase] - Translation phase where error occurred
 * @property {Object} [context] - Additional error context
 * @property {Error} [originalError] - Original JavaScript error object
 */

/**
 * Cache statistics
 *
 * @typedef {Object} CacheStats
 * @property {number} hits - Number of cache hits
 * @property {number} misses - Number of cache misses
 * @property {number} hitRate - Hit rate percentage (0-100)
 * @property {number} size - Current cache size
 * @property {number} [maxSize] - Maximum cache size
 * @property {number} [evictions] - Number of cache evictions
 */

// Export a dummy object to make this a valid module
export const TYPES_VERSION = '1.0.0';

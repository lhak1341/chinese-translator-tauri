/**
 * TypeScript type definitions for dictionary system
 *
 * Defines interfaces for dictionaries, tries, pattern matching,
 * and translation metadata used throughout the translation system.
 */

/**
 * Dictionary entry structure
 * Base format for all dictionary types (patterns, phrases, characters, etc.)
 */
export interface DictionaryEntry {
  /** Source text (Chinese) */
  source: string;

  /** Translation text (Vietnamese) */
  translation: string;

  /** Optional metadata for advanced features */
  metadata?: DictionaryEntryMetadata;
}

/**
 * Pattern dictionary entry with template support
 * Used in patterns.json for semantic pattern matching
 */
export interface PatternDictionaryEntry {
  /** Translation template with variables (e.g., "ở trong X Y") */
  translation: string;

  /** Whether this pattern can be used as a variable in other patterns */
  allowAsPatternVariable?: boolean;

  /** Mark as low priority for pattern competition resolution */
  lowPriority?: boolean;

  /** Restrict variable types (e.g., {'X': ['proper-noun', 'phrase']}) */
  allowedVariableTypes?: Record<string, string[]>;
}

/**
 * Proper noun dictionary structure
 * Loaded from ~/Library/Application Support/translation-app/dictionaries/properNouns-*.json
 */
export interface ProperNounDictionary {
  /** Dictionary name (e.g., "TuChanTheGioi") */
  name: string;

  /** Full file path to dictionary JSON */
  filePath: string;

  /** Map of Chinese proper nouns to Vietnamese translations */
  entries: Record<string, string>;

  /** Optional metadata for entire dictionary */
  metadata?: {
    novel?: string;
    author?: string;
    lastModified?: string;
    entryCount?: number;
  };
}

/**
 * Trie node structure for efficient dictionary lookups
 * Internal structure used by DictionaryTrie class
 */
export interface TrieNode {
  /** Child nodes mapped by character */
  children: Map<string, TrieNode>;

  /** Whether this node represents end of a valid word */
  isEndOfWord: boolean;

  /** Translation if this is end of word */
  translation: string | null;

  /** Additional metadata for this word */
  metadata: DictionaryEntryMetadata | null;
}

/**
 * Dictionary trie for O(k) lookups
 * Optimizes dictionary searches from O(n) to O(k) where k = word length
 */
export interface DictionaryTrie {
  /** Root node of the trie */
  root: TrieNode;

  /** Total number of entries in trie */
  size: number;

  /** Shared array for findMatches to reduce GC pressure */
  sharedMatchesArray: DictionaryMatch[];

  /**
   * Insert word and translation into trie
   * @param word - Source word (Chinese)
   * @param translation - Target translation (Vietnamese)
   * @param metadata - Optional metadata
   */
  insert(word: string, translation: string, metadata?: DictionaryEntryMetadata): void;

  /**
   * Find exact translation for a word
   * @param word - Word to translate
   * @returns Translation or null if not found
   */
  get(word: string): string | null;

  /**
   * Find translation with metadata
   * @param word - Word to translate
   * @returns {translation, metadata} or null
   */
  getWithMetadata(
    word: string
  ): { translation: string; metadata: DictionaryEntryMetadata | null } | null;

  /**
   * Find all possible translations starting at position
   * @param text - Input text
   * @param startPos - Starting position
   * @returns Array of matches with word, translation, endPos, metadata
   */
  findMatches(text: string, startPos?: number): DictionaryMatch[];

  /**
   * Find longest match starting at position
   * @param text - Input text
   * @param startPos - Starting position
   * @returns Longest match or null
   */
  findLongestMatch(text: string, startPos?: number): DictionaryMatch | null;

  /**
   * Clear all entries from trie
   */
  clear(): void;
}

/**
 * Dictionary match result from trie lookup
 * Returned by findMatches() and findLongestMatch()
 */
export interface DictionaryMatch {
  /** Matched word/phrase from source text */
  word: string;

  /** Translation in target language */
  translation: string;

  /** End position in source text (exclusive) */
  endPos?: number;

  /** Source dictionary name */
  dictionary?: string;

  /** Match length in characters */
  length?: number;

  /** Match metadata */
  metadata?: DictionaryEntryMetadata;
}

/**
 * Pattern token types for compiled patterns
 * Used by SemanticPatternProcessor for pattern matching
 */
export type PatternTokenType = 'literal' | 'variable';

/**
 * Pattern token structure
 * Represents a single element in a compiled pattern
 */
export interface PatternToken {
  /** Token type: literal text or variable placeholder */
  type: PatternTokenType;

  /** Literal text value (if type='literal') */
  value?: string;

  /** Variable name (if type='variable', e.g., 'X', 'Y', 'Z') */
  name?: string;
}

/**
 * Compiled semantic pattern
 * Result of parsing a pattern like "在XY中" → "ở trong X Y"
 */
export interface CompiledPattern {
  /** Original pattern text (e.g., "在XY中") */
  originalPattern: string;

  /** Translation template (e.g., "ở trong X Y") */
  template: string;

  /** Parsed tokens (literals and variables) */
  tokens: PatternToken[];

  /** List of variable names used in pattern */
  variables: string[];

  /** First literal token for fast indexing */
  literalPrefix: string;

  /** Pattern metadata for matching behavior */
  metadata: {
    allowedVariableTypes?: Record<string, string[]>;
    lowPriority?: boolean;
    allowAsPatternVariable?: boolean;
  };

  /** Number of tokens in pattern */
  tokenCount?: number;

  /** Unique pattern identifier for caching */
  patternId?: string;
}

/**
 * Pattern match result
 * Returned by testPatternMatch() and applyPatternMatch()
 */
export interface PatternMatchResult {
  /** Whether pattern matched successfully */
  success: boolean;

  /** Pattern that matched */
  pattern?: CompiledPattern;

  /** Variable assignments from match (e.g., {'X': '那些魔帅', 'Y': '眼'}) */
  variables?: Record<string, string>;

  /** Translation result after applying template */
  translation?: string;

  /** Original text that was matched */
  originalText?: string;

  /** Tokens that were matched */
  matchedTokens?: Array<{ value: string; protectedByPhaseA?: boolean }>;

  /** Starting token index */
  startIndex?: number;

  /** Ending token index */
  endIndex?: number;

  /** Match priority for pattern competition */
  priority?: number;

  /** Time taken to match in milliseconds */
  matchTime?: number;

  /** Reason for match failure */
  failureReason?: string;
}

/**
 * Dictionary statistics
 * Performance and usage metrics for dictionaries
 */
export interface DictionaryStats {
  /** Total entries across all dictionaries */
  totalEntries: number;

  /** Load time in milliseconds */
  loadTimeMs: number;

  /** Memory usage in bytes */
  memoryBytes?: number;

  /** Cache hit rate (0-1) */
  cacheHitRate: number;

  /** Total lookups performed */
  totalLookups: number;

  /** Per-dictionary statistics */
  byDictionary?: Record<
    string,
    {
      entries: number;
      avgLookupTime: number;
      hitRate: number;
    }
  >;
}

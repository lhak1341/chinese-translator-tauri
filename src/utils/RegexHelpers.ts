import { logger } from './logger.js';
import { extractErrorMessage } from './errorHelpers';

/**
 * Regex Helper Utilities
 *
 * Provides optimized regex operations for translation engine.
 * Pre-compiling patterns avoids repeated regex creation in tight loops.
 */

/**
 * Dictionary structure for pattern compilation
 */
export type Dictionary = Record<string, unknown>;

/**
 * Compiled pattern entry
 */
export interface CompiledPatternEntry {
  /** Source text */
  source: string;

  /** Translation text (can be any type from dictionary) */
  translation: unknown;

  /** Compiled RegExp pattern (null if compilation failed) */
  pattern: RegExp | null;
}

/**
 * Escape special regex characters in a string
 *
 * @param string - String to escape
 * @returns Escaped string safe for use in RegExp
 *
 * @example
 * const escaped = escapeRegExp("hello (world)");
 * // Returns: "hello \\(world\\)"
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pre-compile regex patterns from dictionary entries
 *
 * Optimization: Creating RegExp objects is expensive. Pre-compiling all patterns
 * before processing text avoids creating 10,000+ RegExp objects in loops.
 *
 * @param dictionary - Dictionary with source -> translation mapping
 * @param flags - RegExp flags (default: global)
 * @returns Map of source text -> compiled RegExp
 *
 * @example
 * const dict = { "hello": "xin chào", "world": "thế giới" };
 * const patterns = precompilePatterns(dict);
 * // Returns: Map { "hello" => /hello/g, "world" => /world/g }
 */
export function precompilePatterns(
  dictionary: Dictionary,
  flags: string = 'g'
): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>();

  for (const [source] of Object.entries(dictionary)) {
    try {
      const pattern = new RegExp(escapeRegExp(source), flags);
      patterns.set(source, pattern);
    } catch (error: unknown) {
      // Skip invalid patterns
      logger.warn(`Failed to compile pattern for "${source}":`, extractErrorMessage(error));
    }
  }

  return patterns;
}

/**
 * Pre-compile sorted dictionary entries with patterns
 *
 * Combines sorting (longest first) and pattern compilation for optimal performance.
 *
 * @param dictionary - Dictionary object
 * @param flags - RegExp flags
 * @returns Sorted entries with compiled patterns
 *
 * @example
 * const dict = { "hi": "chào", "hello": "xin chào" };
 * const sorted = precompileSortedPatterns(dict);
 * // Returns: [
 * //   { source: "hello", translation: "xin chào", pattern: /hello/g },
 * //   { source: "hi", translation: "chào", pattern: /hi/g }
 * // ]
 */
export function precompileSortedPatterns(
  dictionary: Dictionary,
  flags: string = 'g'
): CompiledPatternEntry[] {
  // Sort by length (longest first) to prevent substring matches
  const sortedEntries = Object.entries(dictionary).sort(([a], [b]) => b.length - a.length);

  return sortedEntries.map(([source, translation]) => {
    try {
      const pattern = new RegExp(escapeRegExp(source), flags);
      return { source, translation, pattern };
    } catch (error: unknown) {
      logger.warn(`Failed to compile pattern for "${source}":`, extractErrorMessage(error));
      // Return entry with null pattern to skip during processing
      return { source, translation, pattern: null };
    }
  });
}

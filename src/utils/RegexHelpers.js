/**
 * Regex Helper Utilities
 *
 * Provides optimized regex operations for translation engine.
 * Pre-compiling patterns avoids repeated regex creation in tight loops.
 */

/**
 * Escape special regex characters in a string
 *
 * @param {string} string - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pre-compile regex patterns from dictionary entries
 *
 * Optimization: Creating RegExp objects is expensive. Pre-compiling all patterns
 * before processing text avoids creating 10,000+ RegExp objects in loops.
 *
 * @param {Object} dictionary - Dictionary with source -> translation mapping
 * @param {string} [flags='g'] - RegExp flags (default: global)
 * @returns {Map<string, RegExp>} Map of source text -> compiled RegExp
 */
export function precompilePatterns(dictionary, flags = 'g') {
  const patterns = new Map();

  for (const [source] of Object.entries(dictionary)) {
    try {
      const pattern = new RegExp(escapeRegExp(source), flags);
      patterns.set(source, pattern);
    } catch (error) {
      // Skip invalid patterns
      console.warn(`Failed to compile pattern for "${source}":`, error);
    }
  }

  return patterns;
}

/**
 * Pre-compile sorted dictionary entries with patterns
 *
 * Combines sorting (longest first) and pattern compilation for optimal performance.
 *
 * @param {Object} dictionary - Dictionary object
 * @param {string} [flags='g'] - RegExp flags
 * @returns {Array<{source: string, translation: string, pattern: RegExp}>} Sorted entries with compiled patterns
 */
export function precompileSortedPatterns(dictionary, flags = 'g') {
  // Sort by length (longest first) to prevent substring matches
  const sortedEntries = Object.entries(dictionary).sort(([a], [b]) => b.length - a.length);

  return sortedEntries.map(([source, translation]) => {
    try {
      const pattern = new RegExp(escapeRegExp(source), flags);
      return { source, translation, pattern };
    } catch (error) {
      console.warn(`Failed to compile pattern for "${source}":`, error);
      // Return entry with null pattern to skip during processing
      return { source, translation, pattern: null };
    }
  });
}

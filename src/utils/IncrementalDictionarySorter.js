/**
 * Incremental Dictionary Sorting System
 * Phase 6: Optimize dictionary sorting with incremental updates
 *
 * Instead of re-sorting entire dictionaries on every change, this system:
 * - Maintains sorted order incrementally
 * - Only repositions changed entries
 * - Provides significant performance improvement for large dictionaries
 */

export class IncrementalDictionarySorter {
  constructor() {
    // Cache of sorted entries for each dictionary
    this.sortedCache = new Map();
    // Performance metrics
    this.stats = {
      fullSorts: 0,
      incrementalSorts: 0,
      timeSaved: 0,
      averageFullSortTime: 0,
      averageIncrementalSortTime: 0,
    };
  }

  /**
   * Sort dictionary entries using length-first, then alphabetical ordering
   * Uses incremental sorting when possible for better performance
   * @param {Object} dictionary - Dictionary to sort
   * @param {string} dictionaryId - Unique identifier for caching
   * @param {string} changedKey - Key that was added/modified (optional)
   * @param {string} oldKey - Previous key if this was an edit (optional)
   * @returns {Object} Sorted dictionary
   */
  sortDictionary(dictionary, dictionaryId, changedKey = null, oldKey = null) {
    const startTime = performance.now();

    // Check if we can use incremental sorting
    if (changedKey && this.sortedCache.has(dictionaryId)) {
      const result = this.incrementalSort(dictionary, dictionaryId, changedKey, oldKey);
      if (result) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        this.stats.incrementalSorts++;
        this.stats.averageIncrementalSortTime =
          (this.stats.averageIncrementalSortTime * (this.stats.incrementalSorts - 1) + duration) /
          this.stats.incrementalSorts;

        return result;
      }
    }

    // Fall back to full sort
    const result = this.fullSort(dictionary, dictionaryId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    this.stats.fullSorts++;
    this.stats.averageFullSortTime =
      (this.stats.averageFullSortTime * (this.stats.fullSorts - 1) + duration) /
      this.stats.fullSorts;

    // Calculate time that would have been saved if incremental was used
    if (this.stats.averageIncrementalSortTime > 0) {
      this.stats.timeSaved += Math.max(0, duration - this.stats.averageIncrementalSortTime);
    }

    return result;
  }

  /**
   * Perform full dictionary sort and cache the result
   * @param {Object} dictionary - Dictionary to sort
   * @param {string} dictionaryId - Dictionary identifier
   * @returns {Object} Sorted dictionary
   */
  fullSort(dictionary, dictionaryId) {
    const entries = Object.entries(dictionary);

    // Sort by length (descending) then alphabetically (ascending)
    entries.sort(([keyA, _valA], [keyB, _valB]) => {
      const lengthDiff = keyB.length - keyA.length;
      if (lengthDiff !== 0) return lengthDiff;
      return keyA.localeCompare(keyB);
    });

    // Cache sorted entries for future incremental updates
    this.sortedCache.set(dictionaryId, entries);

    return Object.fromEntries(entries);
  }

  /**
   * Perform incremental sort by repositioning only the changed entry
   * @param {Object} dictionary - Current dictionary state
   * @param {string} dictionaryId - Dictionary identifier
   * @param {string} changedKey - Key that was added/modified
   * @param {string} oldKey - Previous key if this was an edit
   * @returns {Object|null} Sorted dictionary or null if incremental not possible
   */
  incrementalSort(dictionary, dictionaryId, changedKey, oldKey = null) {
    let sortedEntries = this.sortedCache.get(dictionaryId);
    if (!sortedEntries) {
      return null; // No cache available, fall back to full sort
    }

    // Make a copy to avoid mutating cached data
    sortedEntries = [...sortedEntries];

    // Remove old key if this was an edit operation
    if (oldKey && oldKey !== changedKey) {
      const oldIndex = sortedEntries.findIndex(([key]) => key === oldKey);
      if (oldIndex >= 0) {
        sortedEntries.splice(oldIndex, 1);
      }
    }

    // Remove existing entry if it exists (for updates)
    const existingIndex = sortedEntries.findIndex(([key]) => key === changedKey);
    if (existingIndex >= 0) {
      sortedEntries.splice(existingIndex, 1);
    }

    // Check if the key still exists in the dictionary (might have been deleted)
    if (!Object.prototype.hasOwnProperty.call(dictionary, changedKey)) {
      // This was a deletion, we're done
      this.sortedCache.set(dictionaryId, sortedEntries);
      return Object.fromEntries(sortedEntries);
    }

    // Find correct position for the new/updated entry
    const newEntry = [changedKey, dictionary[changedKey]];
    const insertPosition = this.findInsertPosition(sortedEntries, newEntry);

    // Insert at correct position
    sortedEntries.splice(insertPosition, 0, newEntry);

    // Update cache and return result
    this.sortedCache.set(dictionaryId, sortedEntries);
    return Object.fromEntries(sortedEntries);
  }

  /**
   * Find the correct insertion position for a new entry in sorted array
   * Uses binary search for efficiency
   * @param {Array} sortedEntries - Already sorted entries
   * @param {Array} newEntry - [key, value] pair to insert
   * @returns {number} Index where new entry should be inserted
   */
  findInsertPosition(sortedEntries, newEntry) {
    const [newKey] = newEntry;
    let left = 0;
    let right = sortedEntries.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const [midKey] = sortedEntries[mid];

      // Compare using same logic as full sort
      const lengthDiff = midKey.length - newKey.length;
      let comparison;
      if (lengthDiff !== 0) {
        comparison = lengthDiff; // Longer keys come first (positive = mid should be before new)
      } else {
        comparison = newKey.localeCompare(midKey); // Alphabetical when same length
      }

      if (comparison >= 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Invalidate cache for a dictionary (use when structure changes significantly)
   * @param {string} dictionaryId - Dictionary identifier
   */
  invalidateCache(dictionaryId) {
    this.sortedCache.delete(dictionaryId);
  }

  /**
   * Clear all caches (use when memory pressure is high)
   */
  clearAllCaches() {
    this.sortedCache.clear();
  }

  /**
   * Get sorted entries from cache (for debugging)
   * @param {string} dictionaryId - Dictionary identifier
   * @returns {Array} Sorted entries or empty array
   */
  getSortedEntries(dictionaryId) {
    return this.sortedCache.get(dictionaryId) || [];
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance metrics
   */
  getStats() {
    const timeSavedSeconds = this.stats.timeSaved / 1000;
    const efficiencyGain =
      this.stats.fullSorts > 0
        ? this.stats.averageFullSortTime / Math.max(this.stats.averageIncrementalSortTime, 0.001)
        : 0;

    return {
      ...this.stats,
      totalSorts: this.stats.fullSorts + this.stats.incrementalSorts,
      timeSavedSeconds: timeSavedSeconds.toFixed(2),
      efficiencyGain: efficiencyGain.toFixed(1) + 'x',
      incrementalPercentage:
        this.stats.incrementalSorts > 0
          ? (
              (this.stats.incrementalSorts / (this.stats.fullSorts + this.stats.incrementalSorts)) *
              100
            ).toFixed(1) + '%'
          : '0%',
    };
  }

  /**
   * Reset performance statistics
   */
  resetStats() {
    this.stats = {
      fullSorts: 0,
      incrementalSorts: 0,
      timeSaved: 0,
      averageFullSortTime: 0,
      averageIncrementalSortTime: 0,
    };
  }
}

// Export singleton instance for consistent state
export const dictionarySorter = new IncrementalDictionarySorter();

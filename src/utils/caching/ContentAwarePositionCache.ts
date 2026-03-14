/**
 * Content-Aware Position Cache
 * Optimized caching for position mappings based on text content hash
 *
 * OPTIMIZATION: Cache position mappings by exact text content hash
 * - 50-200ms improvement per translation via exact-match cache hits
 * - Preserves clickable highlighting precision
 *
 * NOTE: Similarity matching was disabled in v3 — similar text does not imply the
 * same translation, so approximate matches produced wrong clickable highlighting.
 */

import { logger } from '../logger';
import { LRUCache } from './LRUCache';

// WASM Content Hash (2-3x faster than JavaScript)
let wasmGenerateContentHash: ((text: string) => string) | null = null;

// Dynamically import WASM hash function when available
(async () => {
  try {
    // CI FIX: Use src/wasm path (included in TypeScript) instead of public/wasm
    const wasmModule = await import('../../wasm/translation_wasm_core.js');
    await wasmModule.default();
    wasmGenerateContentHash = wasmModule.generateContentHash;
    logger.log('✅ WASM Content Hash initialized (2-3x speedup)');
  } catch (error) {
    logger.log('⚠️ WASM Content Hash not available, using JavaScript fallback');
  }
})();

/**
 * Configuration options for ContentAwarePositionCache
 */
export interface ContentAwarePositionCacheOptions {
  /** Maximum cache size (default: 500) */
  maxCacheSize?: number;

  /** Maximum age of cache entries in milliseconds (default: 30 minutes) */
  maxCacheAge?: number;
}

/**
 * Content signature based on character frequency and length patterns.
 * Kept as exported type for .d.ts compatibility; no longer used at runtime.
 */
export interface ContentSignature {
  /** Top 20 characters with frequencies (format: "char:freq|char:freq|...") */
  signature: string;

  /** Total text length */
  length: number;

  /** Word count */
  wordCount: number;

  /** Average word length */
  avgWordLength: number;
}

/**
 * Position mapping cache entry
 */
interface PositionMappingCacheEntry {
  /** Position mapping array */
  positionMapping: any;

  /** Timestamp when entry was created */
  timestamp: number;

  /** Time taken to compute the mapping (ms) */
  computeTime: number;

  /** Length of the text */
  textLength: number;
}

/**
 * Cache statistics
 */
interface CacheStatistics {
  /** Number of exact cache hits */
  exactHits: number;

  /** Number of cache misses */
  misses: number;

  /** Number of cache stores */
  stores: number;

  /** Total lookup operations */
  totalLookups: number;

  /** Overall hit rate (percentage) */
  hitRate: number;

  /** Average compute time saved per hit (ms) */
  avgComputeTimeSaved: number;
}

/**
 * Extended statistics returned by getStats()
 */
interface GetStatsResult extends CacheStatistics {
  /** Total cache hits */
  totalHits: number;

  /** Exact hit rate (percentage) */
  exactHitRate: number;

  /** Current cache size */
  cacheSize: number;

  /** Estimated total time saved (ms) */
  estimatedTimeSaved: number;
}

export class ContentAwarePositionCache {
  private cacheVersion: number;
  private maxCacheSize: number;
  private maxCacheAge: number;
  private exactCache: LRUCache<string, PositionMappingCacheEntry>;
  private stats: CacheStatistics;

  constructor(options: ContentAwarePositionCacheOptions = {}) {
    this.cacheVersion = 3; // v3: Disabled similarity matching (was causing wrong position mappings)
    this.maxCacheSize = options.maxCacheSize || 500;
    this.maxCacheAge = options.maxCacheAge || 30 * 60 * 1000; // 30 minutes

    this.exactCache = new LRUCache<string, PositionMappingCacheEntry>(this.maxCacheSize);

    // Check and clear old cache versions
    this.checkCacheVersion();

    // Performance tracking
    this.stats = {
      exactHits: 0,
      misses: 0,
      stores: 0,
      totalLookups: 0,
      hitRate: 0,
      avgComputeTimeSaved: 0,
    };
  }

  /**
   * Check cache version and clear if outdated
   */
  checkCacheVersion(): void {
    try {
      const storedVersion = localStorage.getItem('positionCacheVersion');
      if (storedVersion !== String(this.cacheVersion)) {
        logger.log(`🗑️ Clearing old position cache (v${storedVersion} → v${this.cacheVersion})`);
        this.clear();
        localStorage.setItem('positionCacheVersion', String(this.cacheVersion));
      }
    } catch (error) {
      logger.warn('⚠️ Could not check cache version:', error);
    }
  }

  /**
   * Generate fast content hash for exact matching
   * Uses WASM when available (2-3x faster), falls back to JavaScript
   */
  generateContentHash(text: string): string {
    // Try WASM first (2-3x faster)
    if (wasmGenerateContentHash) {
      try {
        return wasmGenerateContentHash(text);
      } catch (error) {
        logger.warn('⚠️ WASM hash failed, using JavaScript fallback:', error);
        // Fall through to JavaScript implementation
      }
    }

    // JavaScript fallback (FNV-1a-like hash)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate content signature for similarity detection
   * Uses character frequency and length patterns
   */
  generateContentSignature(text: string): ContentSignature {
    // Character frequency signature (first 1000 chars for performance)
    const sampleText = text.substring(0, 1000);
    const charFreq: Record<string, number> = {};

    for (const char of sampleText) {
      charFreq[char] = (charFreq[char] || 0) + 1;
    }

    // Create signature from most frequent characters
    const sortedChars = Object.entries(charFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20) // Top 20 characters
      .map(([char, freq]) => `${char}:${freq}`);

    return {
      signature: sortedChars.join('|'),
      length: text.length,
      wordCount: text.split(/\s+/).length,
      avgWordLength: text.replace(/\s+/g, '').length / Math.max(1, text.split(/\s+/).length),
    };
  }

  /**
   * Calculate similarity between two content signatures
   */
  calculateSimilarity(sig1: ContentSignature, sig2: ContentSignature): number {
    // Length similarity (30% weight)
    const lengthSimilarity =
      1 - Math.abs(sig1.length - sig2.length) / Math.max(sig1.length, sig2.length);

    // Word count similarity (20% weight)
    const wordSimilarity =
      1 - Math.abs(sig1.wordCount - sig2.wordCount) / Math.max(sig1.wordCount, sig2.wordCount);

    // Character frequency similarity (50% weight)
    const chars1 = new Set(sig1.signature.split('|').map((s) => s.split(':')[0]));
    const chars2 = new Set(sig2.signature.split('|').map((s) => s.split(':')[0]));
    const intersection = new Set([...chars1].filter((x) => chars2.has(x)));
    const union = new Set([...chars1, ...chars2]);
    const charSimilarity = intersection.size / union.size;

    return lengthSimilarity * 0.3 + wordSimilarity * 0.2 + charSimilarity * 0.5;
  }

  /**
   * Get cached position mapping
   */
  get(text: string): any | null {
    const startTime = performance.now();
    this.stats.totalLookups++;

    const contentHash = this.generateContentHash(text);

    // Try exact match first
    const exactMatch = this.exactCache.get(contentHash);
    if (exactMatch && this.isValidCacheEntry(exactMatch)) {
      this.stats.exactHits++;
      this.updateHitRate();

      logger.log(`🎯 Position cache exact hit for content hash: ${contentHash}`);
      return exactMatch.positionMapping;
    }

    // Cache miss
    this.stats.misses++;
    this.updateHitRate();

    const elapsed = performance.now() - startTime;
    logger.log(
      `❌ Position cache miss for content hash: ${contentHash} (lookup took ${elapsed.toFixed(1)}ms)`
    );

    return null;
  }

  /**
   * Store position mapping in cache
   */
  set(text: string, positionMapping: any, computeTime: number = 0): void {
    const contentHash = this.generateContentHash(text);

    const cacheEntry: PositionMappingCacheEntry = {
      positionMapping,
      timestamp: Date.now(),
      computeTime,
      textLength: text.length,
    };

    // Store in exact cache
    this.exactCache.set(contentHash, cacheEntry);

    this.stats.stores++;
    this.stats.avgComputeTimeSaved = (this.stats.avgComputeTimeSaved + computeTime) / 2;

    logger.log(
      `💾 Cached position mapping for hash: ${contentHash} (${text.length} chars, ${computeTime.toFixed(1)}ms compute time)`
    );
  }

  /**
   * Check if cache entry is still valid
   */
  isValidCacheEntry(
    entry: PositionMappingCacheEntry | undefined
  ): entry is PositionMappingCacheEntry {
    if (!entry || !entry.timestamp) return false;

    const age = Date.now() - entry.timestamp;
    return age < this.maxCacheAge;
  }

  /**
   * Update hit rate statistics
   */
  updateHitRate(): void {
    this.stats.hitRate =
      this.stats.totalLookups > 0 ? (this.stats.exactHits / this.stats.totalLookups) * 100 : 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): GetStatsResult {
    return {
      ...this.stats,
      totalHits: this.stats.exactHits,
      exactHitRate:
        this.stats.totalLookups > 0 ? (this.stats.exactHits / this.stats.totalLookups) * 100 : 0,
      cacheSize: this.exactCache.size(),
      estimatedTimeSaved: this.stats.exactHits * this.stats.avgComputeTimeSaved,
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.exactCache.clear();

    // Reset stats but keep configuration
    this.stats = {
      exactHits: 0,
      misses: 0,
      stores: 0,
      totalLookups: 0,
      hitRate: 0,
      avgComputeTimeSaved: 0,
    };

    logger.log('🧹 Content-aware position cache cleared');
  }

  /**
   * Clean up cache resources.
   * Stale entries are already rejected on read via isValidCacheEntry();
   * LRU evicts by size. No periodic sweep needed.
   */
  destroy(): void {
    this.exactCache.clear();
  }
}

// Export singleton instance
export const contentAwarePositionCache = new ContentAwarePositionCache();

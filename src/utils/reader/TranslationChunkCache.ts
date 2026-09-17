import type { SemanticArrays } from '../../types/SemanticTypes';
import type { TranslationSegment } from '../../types/TranslationEngineTypes';
import type { ChunkPlan, LineRange } from './TranslationWindow';

/**
 * One translated chunk, as the engine returned it.
 *
 * The cache itself reads none of the highlighting payload — but it is what the panel will
 * hand to the highlighting components, so it keeps the engine's own types rather than
 * erasing them at this boundary. `semanticArrays` is nullable because a failed or empty
 * translation returns no arrays.
 */
export interface CachedChunk {
  chunk: ChunkPlan;
  translatedText: string;
  /**
   * The same chunk through the character-only pass, for the reference panel, or `null`
   * while that second pass is still running — the full translation is published first, so
   * the gloss never delays it.
   *
   * Kept beside the full translation rather than in a cache of its own: the two are
   * produced by one fill, evicted together, and invalidated by the same dictionary
   * version, so a second cache would be a second set of the same three rules to keep in
   * step.
   */
  characterOnlyText: string | null;
  semanticArrays: SemanticArrays | null;
  prebuiltSegments: TranslationSegment[];
}

/**
 * How many translated chunks may live outside the keep band before the oldest are
 * dropped. At ~600 characters a chunk this is on the order of a hundred thousand
 * characters of already-read text — far more than a reading session revisits, and still
 * bounded, which is the point.
 */
export const DEFAULT_CHUNK_CACHE_CAPACITY = 192;

/**
 * The translated-chunk cache: memory only, never disk.
 *
 * Re-translating identical text costs full price — the engine's own semantic cache does
 * not help across calls — so without this, scrolling back re-pays for every passage. It
 * is deliberately not persisted: dictionaries are edited mid-read, so a disk cache would
 * be wrong more often than right, and every staleness bug would present as a translation
 * bug in the wrong layer.
 *
 * Two rules govern what survives:
 *
 * - **Nothing inside the keep band is ever evicted**, whatever the capacity says. That is
 *   what makes crossing the fetch boundary back and forth free instead of a re-request.
 * - **A dictionary-version change clears everything.** Salvaging part of the cache would
 *   mean reasoning about which entries an edit could have touched — the invalidation
 *   matrix that "no disk cache" exists to avoid.
 */
export class TranslationChunkCache {
  /** Insertion order is LRU order: a read deletes and re-inserts, so the oldest is first. */
  private readonly entries = new Map<string, CachedChunk>();

  private readonly capacity: number;

  private currentVersion: number;

  constructor(capacity: number = DEFAULT_CHUNK_CACHE_CAPACITY, version = 0) {
    this.capacity = Math.max(1, capacity);
    this.currentVersion = version;
  }

  get version(): number {
    return this.currentVersion;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Adopt a dictionary version, clearing every entry if it differs from the current one.
   *
   * @returns whether anything was discarded — the caller re-renders only when it was.
   */
  setVersion(version: number): boolean {
    if (version === this.currentVersion) return false;
    this.currentVersion = version;
    const had = this.entries.size > 0;
    this.entries.clear();
    return had;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Reads count as use: the entry moves to the most-recent end. */
  get(key: string): CachedChunk | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(entry: CachedChunk): void {
    this.entries.delete(entry.chunk.key);
    this.entries.set(entry.chunk.key, entry);
  }

  /**
   * Drop the least recently used entries that lie wholly outside the keep band, until the
   * cache fits its capacity. Entries touching the band are pinned regardless — the cache
   * may therefore sit above capacity while a very large band is resident, which is the
   * correct trade: those chunks are about to be read.
   *
   * @returns the keys evicted, oldest first.
   */
  prune(keep: LineRange): string[] {
    const evicted: string[] = [];
    if (this.entries.size <= this.capacity) return evicted;

    for (const [key, entry] of this.entries) {
      if (this.entries.size - evicted.length <= this.capacity) break;
      const { startLine, endLine } = entry.chunk;
      const insideKeep = startLine < keep.end && endLine >= keep.start;
      if (insideKeep) continue;
      evicted.push(key);
    }
    for (const key of evicted) this.entries.delete(key);
    return evicted;
  }

  clear(): void {
    this.entries.clear();
  }

  /** Every entry, least recently used first. */
  values(): CachedChunk[] {
    return [...this.entries.values()];
  }

  /** Every key, least recently used first — the eviction order, for tests and logging. */
  keys(): string[] {
    return [...this.entries.keys()];
  }
}

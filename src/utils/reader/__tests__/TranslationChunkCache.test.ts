import { describe, expect, it } from 'vitest';
import { TranslationChunkCache, type CachedChunk } from '../TranslationChunkCache';
import {
  computeBands,
  planChunks,
  snapRangeToParagraphs,
  type ChunkPlan,
} from '../TranslationWindow';

function chunkPlan(startLine: number, endLine: number): ChunkPlan {
  return {
    key: `${startLine}:0-${endLine}:1`,
    startLine,
    startChar: 0,
    endLine,
    endChar: 1,
    charCount: 1,
  };
}

function entry(startLine: number, endLine: number, translatedText = 'xin chào'): CachedChunk {
  return {
    chunk: chunkPlan(startLine, endLine),
    translatedText,
    characterOnlyText: translatedText,
    semanticArrays: null,
    prebuiltSegments: [],
  };
}

/** Lines of a novel: 40 characters each, one blank line every 20. */
function novel(lineCount: number): string[] {
  return Array.from({ length: lineCount }, (_, i) => (i % 20 === 19 ? '' : '字'.repeat(40)));
}

describe('TranslationChunkCache', () => {
  it('stores and returns a chunk by key', () => {
    const cache = new TranslationChunkCache();
    cache.set(entry(0, 4, 'một'));

    expect(cache.has('0:0-4:1')).toBe(true);
    expect(cache.get('0:0-4:1')?.translatedText).toBe('một');
    expect(cache.get('nope')).toBeUndefined();
  });

  it('evicts the least recently used entries outside the keep band first', () => {
    const cache = new TranslationChunkCache(2);
    cache.set(entry(0, 4));
    cache.set(entry(10, 14));
    cache.set(entry(20, 24));

    const evicted = cache.prune({ start: 900, end: 1000 });

    expect(evicted).toEqual(['0:0-4:1']);
    expect(cache.keys()).toEqual(['10:0-14:1', '20:0-24:1']);
  });

  it('counts a read as a use, so a revisited chunk outlives an older neighbour', () => {
    const cache = new TranslationChunkCache(2);
    cache.set(entry(0, 4));
    cache.set(entry(10, 14));
    cache.get('0:0-4:1');
    cache.set(entry(20, 24));

    expect(cache.prune({ start: 900, end: 1000 })).toEqual(['10:0-14:1']);
    expect(cache.keys()).toEqual(['0:0-4:1', '20:0-24:1']);
  });

  it('never evicts a chunk touching the keep band, even over capacity', () => {
    const cache = new TranslationChunkCache(1);
    cache.set(entry(0, 4));
    cache.set(entry(100, 104));
    cache.set(entry(200, 204));

    const evicted = cache.prune({ start: 90, end: 210 });

    expect(evicted).toEqual(['0:0-4:1']);
    expect(cache.size).toBe(2);
  });

  it('counts a chunk straddling a band edge as inside it', () => {
    const cache = new TranslationChunkCache(1);
    cache.set(entry(0, 10));
    cache.set(entry(45, 55));

    // The band is half-open: line 10 is inside it, line 50 is not — a chunk overlapping
    // either edge by one line is still a chunk the reader is about to read.
    expect(cache.prune({ start: 10, end: 50 })).toEqual([]);
    expect(cache.size).toBe(2);
  });

  it('counts a chunk starting exactly at the band end as outside it', () => {
    const cache = new TranslationChunkCache(1);
    cache.set(entry(20, 30));
    cache.set(entry(50, 60));

    expect(cache.prune({ start: 10, end: 50 })).toEqual(['50:0-60:1']);
  });

  it('evicts nothing while the cache fits its capacity', () => {
    const cache = new TranslationChunkCache(4);
    cache.set(entry(0, 4));
    cache.set(entry(10, 14));

    expect(cache.prune({ start: 900, end: 1000 })).toEqual([]);
    expect(cache.size).toBe(2);
  });

  it('discards every entry when the dictionary version changes', () => {
    const cache = new TranslationChunkCache(10, 3);
    cache.set(entry(0, 4));
    cache.set(entry(10, 14));

    expect(cache.setVersion(3)).toBe(false);
    expect(cache.size).toBe(2);

    expect(cache.setVersion(4)).toBe(true);
    expect(cache.size).toBe(0);
    expect(cache.version).toBe(4);
  });

  it('reports nothing discarded when an empty cache changes version', () => {
    const cache = new TranslationChunkCache();

    expect(cache.setVersion(1)).toBe(false);
  });

  it('re-caches the same key rather than duplicating it', () => {
    const cache = new TranslationChunkCache();
    cache.set(entry(0, 4, 'cũ'));
    cache.set(entry(0, 4, 'mới'));

    expect(cache.size).toBe(1);
    expect(cache.get('0:0-4:1')?.translatedText).toBe('mới');
  });
});

describe('hysteresis between the fetch and keep bands', () => {
  const lines = novel(4000);
  const getLine = (index: number): string | undefined => lines[index];
  const geometry = { viewportLines: 20, overscanLines: 5, lineCount: lines.length };

  /** One anchor move: plan the fetch band, translate what is missing, prune. */
  function moveTo(cache: TranslationChunkCache, anchorLine: number) {
    const bands = computeBands({ ...geometry, anchorLine });
    const evicted = cache.prune(bands.keep);
    const plan = planChunks(
      snapRangeToParagraphs(bands.fetch, getLine, lines.length),
      getLine,
      lines.length
    );
    const translated: string[] = [];
    for (const chunk of plan) {
      if (cache.has(chunk.key)) continue;
      translated.push(chunk.key);
      cache.set({
        chunk,
        translatedText: 'bản dịch',
        semanticArrays: null,
        prebuiltSegments: [],
      });
    }
    return { translated, evicted, planned: plan.length };
  }

  it('does not re-request a chunk when the anchor crosses the fetch boundary and back', () => {
    const cache = new TranslationChunkCache();
    const settle = moveTo(cache, 2000);
    expect(settle.translated.length).toBeGreaterThan(0);

    // Far enough forward to leave the old fetch band entirely (2 viewports = 40 lines),
    // then back — the exact oscillation a single threshold would thrash on.
    const forward = moveTo(cache, 2060);
    const back = moveTo(cache, 2000);
    const forwardAgain = moveTo(cache, 2060);

    expect(back.translated).toEqual([]);
    expect(forwardAgain.translated).toEqual([]);
    expect(forward.evicted).toEqual([]);
    expect(back.evicted).toEqual([]);
    expect(forwardAgain.evicted).toEqual([]);
  });

  it('only translates what the new band adds when the anchor moves forward', () => {
    const cache = new TranslationChunkCache();
    const first = moveTo(cache, 2000);
    const second = moveTo(cache, 2060);

    expect(second.translated.length).toBeLessThan(first.translated.length);
    expect(second.planned).toBeGreaterThan(second.translated.length);
  });

  it('re-translates everything on the same anchor after a dictionary version bump', () => {
    const cache = new TranslationChunkCache();
    const first = moveTo(cache, 2000);

    cache.setVersion(cache.version + 1);
    const afterReload = moveTo(cache, 2000);

    expect(afterReload.translated).toEqual(first.translated);
  });
});

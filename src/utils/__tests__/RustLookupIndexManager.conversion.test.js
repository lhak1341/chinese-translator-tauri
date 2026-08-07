/**
 * Coverage for RustLookupIndexManager.convertDictionariesToRustFormat.
 *
 * Previously untested (only fallback/error-handling behavior had coverage, always with an
 * empty dictionariesMap). This exercises the actual conversion from DictionaryManager's
 * flatEntries map to the {name, entries, priority} shape sent to Rust.
 *
 * `priority` is the real dictionary priority (DictionaryManager.getPriorityForDictionary),
 * passed in via a priorityByName Map — NOT derived from dictionaryOrder's array position.
 * Fixed 2026-08-07 (architecture review candidate #4 grilling): the array-index substitution
 * was confirmed behavior-neutral for the one real caller (which always pre-sorts
 * dictionaryOrder by real priority), but was a latent trap for any future caller or
 * comparator that didn't share that assumption. See CONTEXT.md's LookupIndexBuilder entry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import RustLookupIndexManager from '../RustLookupIndexManager.js';

describe('RustLookupIndexManager.convertDictionariesToRustFormat', () => {
  let manager;

  beforeEach(() => {
    manager = new RustLookupIndexManager();
  });

  it('converts a flat-entries Map into ordered {name, entries, priority} objects using real priority', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
      ['phrases', [{ chinese: '你好', vietnamese: 'xin chào', metadata: null }]],
    ]);
    const priorityByName = new Map([
      ['characters', 6],
      ['phrases', 4],
    ]);
    const result = manager.convertDictionariesToRustFormat(
      flatEntriesMap,
      ['characters', 'phrases'],
      priorityByName
    );

    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 6,
      },
      {
        name: 'phrases',
        entries: [{ chinese: '你好', vietnamese: 'xin chào', metadata: null }],
        priority: 4,
      },
    ]);
  });

  it('gives two dictionaries with the same real priority equal priority, not sequential values', () => {
    const flatEntriesMap = new Map([
      ['properNouns-f_A', [{ chinese: 'a', vietnamese: 'A', metadata: null }]],
      ['properNouns-f_B', [{ chinese: 'b', vietnamese: 'B', metadata: null }]],
    ]);
    const priorityByName = new Map([
      ['properNouns-f_A', 1],
      ['properNouns-f_B', 1],
    ]);
    const result = manager.convertDictionariesToRustFormat(
      flatEntriesMap,
      ['properNouns-f_A', 'properNouns-f_B'],
      priorityByName
    );

    expect(result.find((d) => d.name === 'properNouns-f_A').priority).toBe(1);
    expect(result.find((d) => d.name === 'properNouns-f_B').priority).toBe(1);
  });

  it('falls back to 999 for a dictionary name missing from priorityByName', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(
      flatEntriesMap,
      ['characters'],
      new Map() // no entry for 'characters'
    );

    expect(result[0].priority).toBe(999);
  });

  it('falls back to 999 for every entry when priorityByName is omitted', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, ['characters']);

    expect(result[0].priority).toBe(999);
  });

  it('preserves dictionaryOrder for name/entries regardless of map insertion order', () => {
    const flatEntriesMap = new Map([
      ['phrases', [{ chinese: 'a', vietnamese: 'b', metadata: null }]],
      ['characters', [{ chinese: 'c', vietnamese: 'd', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, [
      'characters',
      'phrases',
    ]);

    expect(result.map((d) => d.name)).toEqual(['characters', 'phrases']);
  });

  it('skips dictionary names in dictionaryOrder that have no entry in the map', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, [
      'characters',
      'missing-dictionary',
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('characters');
  });

  it('accepts a plain object as well as a Map', () => {
    const flatEntriesObj = {
      characters: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
    };
    const priorityByName = new Map([['characters', 3]]);
    const result = manager.convertDictionariesToRustFormat(
      flatEntriesObj,
      ['characters'],
      priorityByName
    );
    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 3,
      },
    ]);
  });

  it('uses all map keys as the order when dictionaryOrder is not provided', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
    ]);
    const priorityByName = new Map([['characters', 6]]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, null, priorityByName);
    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 6,
      },
    ]);
  });

  it('returns an empty array for an empty flatEntriesMap', () => {
    const result = manager.convertDictionariesToRustFormat(new Map(), [], new Map());
    expect(result).toEqual([]);
  });
});

/**
 * Coverage for RustLookupIndexManager.convertDictionariesToRustFormat.
 *
 * Previously untested (only fallback/error-handling behavior had coverage, always with an
 * empty dictionariesMap). This exercises the actual conversion from DictionaryManager's
 * flatEntries map to the {name, entries, priority} shape sent to Rust.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import RustLookupIndexManager from '../RustLookupIndexManager.js';

describe('RustLookupIndexManager.convertDictionariesToRustFormat', () => {
  let manager;

  beforeEach(() => {
    manager = new RustLookupIndexManager();
  });

  it('converts a flat-entries Map into ordered {name, entries, priority} objects', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
      ['phrases', [{ chinese: '你好', vietnamese: 'xin chào', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, [
      'characters',
      'phrases',
    ]);

    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 0,
      },
      {
        name: 'phrases',
        entries: [{ chinese: '你好', vietnamese: 'xin chào', metadata: null }],
        priority: 1,
      },
    ]);
  });

  it('assigns priority from position in dictionaryOrder, not insertion order in the map', () => {
    const flatEntriesMap = new Map([
      ['phrases', [{ chinese: 'a', vietnamese: 'b', metadata: null }]],
      ['characters', [{ chinese: 'c', vietnamese: 'd', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, [
      'characters',
      'phrases',
    ]);

    expect(result.map((d) => d.name)).toEqual(['characters', 'phrases']);
    expect(result.find((d) => d.name === 'characters').priority).toBe(0);
    expect(result.find((d) => d.name === 'phrases').priority).toBe(1);
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
    const result = manager.convertDictionariesToRustFormat(flatEntriesObj, ['characters']);
    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 0,
      },
    ]);
  });

  it('uses all map keys as the order when dictionaryOrder is not provided', () => {
    const flatEntriesMap = new Map([
      ['characters', [{ chinese: '你', vietnamese: 'bạn', metadata: null }]],
    ]);
    const result = manager.convertDictionariesToRustFormat(flatEntriesMap, null);
    expect(result).toEqual([
      {
        name: 'characters',
        entries: [{ chinese: '你', vietnamese: 'bạn', metadata: null }],
        priority: 0,
      },
    ]);
  });

  it('returns an empty array for an empty flatEntriesMap', () => {
    const result = manager.convertDictionariesToRustFormat(new Map(), []);
    expect(result).toEqual([]);
  });
});

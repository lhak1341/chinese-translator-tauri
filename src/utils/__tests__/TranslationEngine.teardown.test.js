/**
 * Translation Engine - teardown releases dictionaries
 *
 * A dictionary reload does not mutate the engine in place: it destroys the old one and
 * constructs a replacement (`useTranslatorEngine.runEngineInit`). So `destroy()` runs as
 * often as the reader reloads, and anything it fails to release is leaked once per reload
 * for the life of the session.
 *
 * `destroy()` used to call only `dictionaryManager.clearCache()`, which empties the
 * translation cache and nothing else — every trie, the flat entry list, and the WASM
 * `DictionaryEngine` holding a copy of every dictionary all outlived the engine that owned
 * them. `DictionaryManager.dispose()` is the method that releases all three, and its own
 * doc comment says it exists to prevent exactly this leak; nothing called it.
 *
 * These tests pin the wiring rather than the leak itself: a heap measurement would be
 * flaky, but "teardown calls the method that frees things" is exact.
 */

import { describe, test, expect, vi } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';

/** A stand-in dictionary manager that records which teardown path was taken. */
function spyManager() {
  return {
    clearCache: vi.fn(),
    dispose: vi.fn(),
    isReady: () => false,
  };
}

describe('TranslationEngine.destroy - dictionary release', () => {
  test('disposes the dictionary manager rather than only clearing its cache', () => {
    const engine = createTranslationEngine();
    const manager = spyManager();
    engine.dictionaryManager = manager;

    engine.destroy();

    expect(manager.dispose).toHaveBeenCalledTimes(1);
    // `dispose()` clears the cache itself; calling both would be double work on a path that
    // already nulls the fields the second call would read.
    expect(manager.clearCache).not.toHaveBeenCalled();
  });

  test('survives a manager that is already gone', () => {
    const engine = createTranslationEngine();
    engine.dictionaryManager = null;

    expect(() => engine.destroy()).not.toThrow();
  });

  test('reports itself not ready afterwards', () => {
    const engine = createTranslationEngine();
    engine.dictionaryManager = spyManager();

    engine.destroy();

    expect(engine.isReady()).toBe(false);
  });

  test('a reload-shaped sequence of teardowns disposes once per engine', () => {
    // Twenty reloads in a session is an ordinary afternoon's reading. Each one must
    // release its own engine's dictionaries — that is the whole difference between memory
    // tracking the book and memory tracking the number of reloads.
    const managers = [];

    for (let reload = 0; reload < 20; reload += 1) {
      const engine = createTranslationEngine();
      const manager = spyManager();
      engine.dictionaryManager = manager;
      managers.push(manager);
      engine.destroy();
    }

    expect(managers).toHaveLength(20);
    for (const manager of managers) {
      expect(manager.dispose).toHaveBeenCalledTimes(1);
    }
  });
});

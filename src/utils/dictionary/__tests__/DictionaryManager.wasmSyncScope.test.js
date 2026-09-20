/**
 * `syncDictionariesToWasm` uploads only what it is asked to.
 *
 * A sync serializes every entry of every dictionary it is handed into JSON, hands the
 * string to Rust, and rebuilds the trie there. The characters dictionary alone is 27,000+
 * entries, so the cost is not incidental.
 *
 * It used to be unscoped, and `TranslationEngine.invalidateDictionaryCaches()` calls it
 * after *every* dictionary entry the editor adds — so adding entries while reading paid a
 * full-corpus re-upload per entry. The block that called it was already commented
 * "Re-sync specific dictionary to WASM", and already had the name in scope; it just never
 * passed it.
 *
 * These tests pin the scoping, and the two things the scoping must not break: a whole
 * reload still syncing everything, and priorities still arriving in full.
 */

import { describe, it, expect, vi } from 'vitest';
import { DictionaryManager } from '../DictionaryManager.js';

/** A manager with `wasmLookup` replaced by a spy, and two dictionaries loaded. */
async function loadedManager() {
  const manager = new DictionaryManager();
  await manager.loadDictionaries({
    characters: { 的: 'của', 是: 'là' },
    phrases: { 你好: 'xin chào' },
  });

  const sync = vi.fn(async () => true);
  manager.wasmLookup = { isReady: () => true, sync };
  return { manager, sync };
}

/** The dictionary names a `sync` call was handed, in call order. */
function syncedNames(sync, callIndex = 0) {
  return [...sync.mock.calls[callIndex][0].keys()];
}

describe('DictionaryManager.syncDictionariesToWasm', () => {
  it('syncs every dictionary when no name is given', async () => {
    const { manager, sync } = await loadedManager();

    await manager.syncDictionariesToWasm();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(syncedNames(sync).sort()).toEqual(['characters', 'phrases']);
  });

  it('syncs only the named dictionary', async () => {
    const { manager, sync } = await loadedManager();

    await manager.syncDictionariesToWasm('phrases');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(syncedNames(sync)).toEqual(['phrases']);
  });

  it('hands the named dictionary its real entries', async () => {
    const { manager, sync } = await loadedManager();

    await manager.syncDictionariesToWasm('phrases');

    const entries = sync.mock.calls[0][0].get('phrases');
    expect(entries).toEqual(manager.flatEntries.get('phrases'));
    expect(entries.length).toBeGreaterThan(0);
  });

  // Priorities are a small map keyed by name and the lookup stores them wholesale, so
  // narrowing the entries must not narrow these — a scoped sync that dropped them would
  // leave every *other* dictionary's priority unset on the next lookup.
  it('still passes the full priority map when scoped', async () => {
    const { manager, sync } = await loadedManager();

    await manager.syncDictionariesToWasm('phrases');

    const priorities = sync.mock.calls[0][1];
    expect([...priorities.keys()].sort()).toEqual(['characters', 'phrases']);
  });

  // A silent full sync is exactly the cost the parameter exists to avoid, so an unknown
  // name must not fall back to everything.
  it('syncs nothing for a name it does not have', async () => {
    const { manager, sync } = await loadedManager();

    await manager.syncDictionariesToWasm('nope');

    expect(sync).not.toHaveBeenCalled();
  });

  it('does nothing at all when WASM is not ready', async () => {
    const { manager } = await loadedManager();
    const sync = vi.fn(async () => true);
    manager.wasmLookup = { isReady: () => false, sync };

    await manager.syncDictionariesToWasm('phrases');

    expect(sync).not.toHaveBeenCalled();
  });

  it('does nothing when there is no WASM lookup at all', async () => {
    const { manager } = await loadedManager();
    manager.wasmLookup = null;

    await expect(manager.syncDictionariesToWasm('phrases')).resolves.toBeUndefined();
  });

  // The shape of adding twenty entries to one dictionary during a reading session: the
  // other dictionary must never be re-uploaded, not even once.
  it('never re-uploads an untouched dictionary across repeated edits', async () => {
    const { manager, sync } = await loadedManager();

    for (let edit = 0; edit < 20; edit += 1) {
      await manager.syncDictionariesToWasm('phrases');
    }

    expect(sync).toHaveBeenCalledTimes(20);
    for (let call = 0; call < 20; call += 1) {
      expect(syncedNames(sync, call)).toEqual(['phrases']);
    }
  });
});

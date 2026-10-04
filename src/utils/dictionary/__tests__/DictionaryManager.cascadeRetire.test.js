/**
 * A shared-binary panic retires the WASM dictionary; lookups must then serve from JS.
 *
 * `WasmDictionaryManager` stops touching the engine once the cascade fires (its engine is
 * built on the corrupted allocator), so every WASM lookup returns "nothing". The readiness
 * verdict `DictionaryManager` branches on used to disagree: the adapter kept reporting ready,
 * so the JS path never ran and every word silently missed. These tests cross the real
 * `DictionaryManager` → `WasmDictionaryAdapter` → `WasmDictionaryManager` stack, with only the
 * WASM binary mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEngine = {
  load_dictionary: vi.fn(() => true),
  find_matches: vi.fn(() => '[]'),
  find_longest_match: vi.fn(() => null),
  get_total_entries: vi.fn(() => 0),
  get_dictionary_count: vi.fn(() => 0),
  has_dictionary: vi.fn(() => true),
  clear_all_dictionaries: vi.fn(),
};

vi.mock('../../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn(() => Promise.resolve()),
  DictionaryEngine: vi.fn(function () {
    return mockEngine;
  }),
}));

vi.mock('../../wasm/WasmSharedModule', async () => {
  const core = await import('../../../wasm/translation_wasm_core.js');
  return { loadSharedWasmModule: () => core.default() };
});

vi.mock('../../wasm/WasmMemoryPoolManager.js', () => ({
  wasmMemoryPoolManager: {
    getBuffer: vi.fn(() => new ArrayBuffer(1024)),
    returnBuffer: vi.fn(),
    getStats: vi.fn(() => ({ totalMemoryUsage: 0 })),
    cleanup: vi.fn(),
  },
}));

vi.mock('../../wasm/WasmTextAssembler', () => ({
  wasmTextAssembler: { retireOnSharedModulePanic: vi.fn(), initialized: false },
}));

vi.mock('../../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      initialize: vi.fn(async (instantiateFn) => {
        await instantiateFn(new ArrayBuffer(0));
        return true;
      }),
      hasFailed: false,
      pendingInit: null,
    };
  }),
}));

vi.mock('../../toast', () => ({ default: { warning: vi.fn() } }));

describe('DictionaryManager after a WASM cascade retire', () => {
  let manager;
  let fireCascadeRetire;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Fresh module registry: `_sharedModuleCorrupted` is module-global and permanent.
    vi.resetModules();

    const { DictionaryManager } = await import('../DictionaryManager.js');
    const { WasmDictionaryAdapter } = await import('../../wasm/WasmDictionaryAdapter.js');
    ({ fireCascadeRetire } = await import('../../wasm/WasmCascadeRegistry.js'));

    manager = new DictionaryManager({ wasmAdapter: new WasmDictionaryAdapter() });
    await manager.loadDictionaries({ phrases: { 你好: 'xin chào' } });
    await manager.wasmLookup.initialize({});
  });

  it('serves translate() from JS once the cascade has fired', () => {
    expect(manager.wasmLookup.isReady()).toBe(true);

    fireCascadeRetire();

    expect(manager.translate('你好')?.translation).toBe('xin chào');
  });

  it('reports WASM not ready once the cascade has fired', () => {
    fireCascadeRetire();

    expect(manager.wasmLookup.isReady()).toBe(false);
  });

  it('never calls the engine after the cascade has fired', async () => {
    fireCascadeRetire();
    vi.clearAllMocks();

    await manager.wasmLookup._adapter.loadDictionary('phrases', [{ chinese: '你好' }]);
    manager.wasmLookup._adapter.clearAll();
    manager.translate('你好');

    expect(mockEngine.load_dictionary).not.toHaveBeenCalled();
    expect(mockEngine.clear_all_dictionaries).not.toHaveBeenCalled();
    expect(mockEngine.find_matches).not.toHaveBeenCalled();
  });
});

/**
 * A WASM panic in the string processor retires it through the shared cascade registry: the
 * instance is destroyed once (by the wrapper's own cascade handler, not by its catch block),
 * and later calls never reach the corrupted object.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockBuildCache, mockDestroy, lifecycleState } = vi.hoisted(() => ({
  mockBuildCache: vi.fn(),
  mockDestroy: vi.fn(),
  lifecycleState: { isReady: false, hasFailed: false },
}));

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn(async () => undefined),
  StringProcessor: class {
    buildCache(json) {
      return mockBuildCache(json);
    }
    getStats() {
      return JSON.stringify({ cacheSize: 0, memoryBytes: 0 });
    }
    __destroy_into_raw() {
      mockDestroy();
    }
  },
}));

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      get isReady() {
        return lifecycleState.isReady;
      },
      get hasFailed() {
        return lifecycleState.hasFailed;
      },
      initialize: vi.fn(async (instantiateFn) => {
        if (lifecycleState.hasFailed) return false;
        await instantiateFn(new ArrayBuffer(0));
        lifecycleState.isReady = true;
        return true;
      }),
      permanentlyFail: vi.fn(() => {
        lifecycleState.isReady = false;
        lifecycleState.hasFailed = true;
      }),
    };
  }),
}));

const tokens = [{ value: '你', type: 'chinese_char', position: 0 }];

async function importFresh() {
  vi.resetModules();
  lifecycleState.isReady = false;
  lifecycleState.hasFailed = false;
  const { wasmStringProcessor } = await import('../wasm/WasmStringProcessor.js');
  const { fireCascadeRetire } = await import('../wasm/WasmCascadeRegistry.js');
  await wasmStringProcessor.buildCache([]); // settles the import-time background init
  mockBuildCache.mockClear();
  return { wasmStringProcessor, fireCascadeRetire };
}

beforeEach(() => {
  mockBuildCache.mockReset();
  mockBuildCache.mockReturnValue(true);
  mockDestroy.mockReset();
});

describe('WasmStringProcessor panic handling', () => {
  test('builds the cache through WASM while healthy', async () => {
    const { wasmStringProcessor } = await importFresh();

    expect(await wasmStringProcessor.buildCache(tokens)).toBe(true);
    expect(mockBuildCache).toHaveBeenCalledTimes(1);
  });

  test('a panic returns false, destroys the instance once, and retires it for good', async () => {
    const { wasmStringProcessor } = await importFresh();
    mockBuildCache.mockImplementationOnce(() => {
      throw new Error('wasm panic');
    });

    expect(await wasmStringProcessor.buildCache(tokens)).toBe(false);
    expect(mockDestroy).toHaveBeenCalledTimes(1);

    mockBuildCache.mockReturnValue(true);
    expect(await wasmStringProcessor.buildCache(tokens)).toBe(false);
    expect(mockBuildCache).toHaveBeenCalledTimes(1); // the throwing call only
  });

  test("a sibling wrapper's panic retires it too", async () => {
    const { wasmStringProcessor, fireCascadeRetire } = await importFresh();

    fireCascadeRetire();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(await wasmStringProcessor.buildCache(tokens)).toBe(false);
    expect(mockBuildCache).not.toHaveBeenCalled();
  });
});

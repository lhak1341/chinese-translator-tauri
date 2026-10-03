/**
 * The WASM path of Phase 4 conflict resolution: the flat-array packing that crosses the
 * boundary, retry of a transient load failure, and retirement after a panic. The fallback
 * algorithm itself is covered by ConflictResolution.parity.test.js.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockInit } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockInit: vi.fn(async () => undefined),
}));

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: (...args) => mockInit(...args),
  resolveGlobalConflicts: (...args) => mockResolve(...args),
}));

// The shared loader fetches and verifies the real binary; these tests drive the mocked `default`
// (init) directly, so route the loader through it.
vi.mock('../wasm/WasmSharedModule', async () => {
  const core = await import('../../wasm/translation_wasm_core.js');
  return { loadSharedWasmModule: () => core.default() };
});

// The lifecycle fetches and verifies the binary too; give it something valid to read.
vi.mock('../wasm/wasmBinaryCache', () => ({
  fetchWasmBinary: vi.fn(async () => new ArrayBuffer(8)),
}));
vi.mock('../wasm/wasmIntegrityVerifier', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyWasmBinaryIntegrity: vi.fn(async () => ({ valid: true, errors: [], warnings: [] })),
}));

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const phrase = { type: 'phrase', startIndex: 0, endIndex: 2, length: 3 };
const pattern = { type: 'pattern', startIndex: 0, endIndex: 1, length: 2 };
const literal = { type: 'literal', startIndex: 5, endIndex: 5, length: 1 };

async function importFresh() {
  vi.resetModules();
  const mod = await import('../wasm/WasmConflictResolution.js');
  const { fireCascadeRetire } = await import('../wasm/WasmCascadeRegistry.js');
  return { ...mod, fireCascadeRetire };
}

async function importReady() {
  const mod = await importFresh();
  expect(await mod.initializeWasmConflictResolution()).toBe(true);
  return mod;
}

beforeEach(() => {
  mockResolve.mockReset();
  mockInit.mockReset();
  mockInit.mockResolvedValue(undefined);
});

describe('WasmConflictResolution — WASM path', () => {
  test('packs [start, end, length, typePriority] per match: phrase 1, pattern 2, anything else 3', async () => {
    const { resolveGlobalConflictsWasm } = await importReady();
    mockResolve.mockReturnValue(new Uint32Array([0]));

    resolveGlobalConflictsWasm([phrase, pattern, literal]);

    expect(Array.from(mockResolve.mock.calls[0][0])).toEqual([0, 2, 3, 1, 0, 1, 2, 2, 5, 5, 1, 3]);
  });

  test('maps the returned indices back to the caller’s own match objects, in order', async () => {
    const { resolveGlobalConflictsWasm } = await importReady();
    mockResolve.mockReturnValue(new Uint32Array([2, 0]));

    const result = resolveGlobalConflictsWasm([phrase, pattern, literal]);

    expect(result[0]).toBe(literal);
    expect(result[1]).toBe(phrase);
    expect(result).toHaveLength(2);
  });

  test('a transient load failure is retried by the lifecycle instead of failing for the session', async () => {
    vi.useFakeTimers();
    try {
      const { initializeWasmConflictResolution } = await importFresh();
      mockInit.mockRejectedValueOnce(new Error('network error loading wasm'));

      const init = initializeWasmConflictResolution();
      await vi.advanceTimersByTimeAsync(10000);

      expect(await init).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a panic falls back to JS and retires the wrapper for good', async () => {
    const { resolveGlobalConflictsWasm, initializeWasmConflictResolution } = await importReady();
    mockResolve.mockImplementationOnce(() => {
      throw new Error('wasm panic');
    });

    const result = resolveGlobalConflictsWasm([phrase, pattern]);
    expect(result).toEqual([phrase]); // the JS fallback's answer: longer wins

    mockResolve.mockReturnValue(new Uint32Array([0]));
    resolveGlobalConflictsWasm([phrase, pattern]);
    expect(mockResolve).toHaveBeenCalledTimes(1); // the throwing call only
    expect(await initializeWasmConflictResolution()).toBe(false);
  });

  test("a sibling wrapper's panic retires it too", async () => {
    const { resolveGlobalConflictsWasm, initializeWasmConflictResolution, fireCascadeRetire } =
      await importReady();

    fireCascadeRetire();

    expect(resolveGlobalConflictsWasm([phrase, pattern])).toEqual([phrase]);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(await initializeWasmConflictResolution()).toBe(false);
  });
});

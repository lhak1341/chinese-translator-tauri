import { describe, it, expect, vi, beforeEach } from 'vitest';

const BINARY = new Uint8Array([0, 97, 115, 109]);

const initMock = vi.fn();
const fetchMock = vi.fn();
const verifyMock = vi.fn();
const handlers = [];

vi.mock('../../wasm/translation_wasm_core.js', () => ({ default: (...a) => initMock(...a) }));
vi.mock('../wasm/wasmBinaryCache', () => ({ fetchWasmBinary: (...a) => fetchMock(...a) }));
vi.mock('../wasm/wasmIntegrityVerifier', () => ({
  verifyWasmBinaryIntegrity: (...a) => verifyMock(...a),
}));
vi.mock('../wasm/WasmCascadeRegistry', () => ({
  registerCascadeHandler: (fn) => handlers.push(fn),
}));

async function freshLoader() {
  vi.resetModules();
  handlers.length = 0;
  return import('../wasm/WasmSharedModule.js');
}

beforeEach(() => {
  initMock.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue(BINARY);
  verifyMock.mockReset().mockResolvedValue({ valid: true, errors: [], warnings: [] });
});

describe('loadSharedWasmModule', () => {
  it('instantiates once, from the verified binary, however many callers race', async () => {
    const { loadSharedWasmModule } = await freshLoader();
    await Promise.all(Array.from({ length: 7 }, () => loadSharedWasmModule()));
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(BINARY);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('returns at once on later calls without fetching or instantiating again', async () => {
    const { loadSharedWasmModule } = await freshLoader();
    await loadSharedWasmModule();
    await loadSharedWasmModule();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('never instantiates a binary that fails verification', async () => {
    verifyMock.mockResolvedValue({ valid: false, errors: ['hash mismatch'], warnings: [] });
    const { loadSharedWasmModule } = await freshLoader();
    await expect(loadSharedWasmModule()).rejects.toThrow(/integrity check failed: hash mismatch/);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('rejects with the load error, then tries again on the next call', async () => {
    initMock.mockRejectedValueOnce(new Error('network down'));
    const { loadSharedWasmModule } = await freshLoader();
    await expect(loadSharedWasmModule()).rejects.toThrow('network down');
    await expect(loadSharedWasmModule()).resolves.toBeUndefined();
    expect(initMock).toHaveBeenCalledTimes(2);
  });

  it('rejects for good once the cascade has retired it, and never re-instantiates', async () => {
    const { loadSharedWasmModule } = await freshLoader();
    await loadSharedWasmModule();
    handlers.forEach((fn) => fn());
    await expect(loadSharedWasmModule()).rejects.toThrow(/retired after a panic/);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('a load that is in flight when the cascade fires does not report success', async () => {
    let release;
    initMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const { loadSharedWasmModule } = await freshLoader();
    const pending = loadSharedWasmModule();
    await vi.waitFor(() => expect(initMock).toHaveBeenCalled());
    handlers.forEach((fn) => fn());
    release();
    await expect(pending).rejects.toThrow(/retired after a panic/);
  });
});

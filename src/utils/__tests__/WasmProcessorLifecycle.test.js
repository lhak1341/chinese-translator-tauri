import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../wasm/wasmBinaryCache', () => ({
  fetchWasmBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));
vi.mock('../wasm/wasmIntegrityVerifier', () => ({
  verifyWasmBinaryIntegrity: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
  verifyWasmInstance: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { WasmProcessorLifecycle } from '../wasm/WasmProcessorLifecycle';
import { fetchWasmBinary } from '../wasm/wasmBinaryCache';
import { verifyWasmBinaryIntegrity, verifyWasmInstance } from '../wasm/wasmIntegrityVerifier';

const makeConfig = (overrides = {}) => ({
  name: 'TestProcessor',
  wasmFileName: 'test.wasm',
  wasmBinaryUrl: new URL('http://localhost/test.wasm'),
  expectedMethods: ['processTokens', 'initialize'],
  ...overrides,
});

const makeInstantiateFn = (instance = { processTokens: vi.fn(), initialize: vi.fn() }) =>
  vi.fn().mockResolvedValue(instance);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWasmBinary).mockResolvedValue(new ArrayBuffer(8));
  vi.mocked(verifyWasmBinaryIntegrity).mockResolvedValue({ valid: true, errors: [], warnings: [] });
  vi.mocked(verifyWasmInstance).mockReturnValue({ valid: true, errors: [] });
});

describe('WasmProcessorLifecycle — initial state', () => {
  test('isReady is false', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    expect(lc.isReady).toBe(false);
  });

  test('hasFailed is false', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    expect(lc.hasFailed).toBe(false);
  });

  test('pendingInit is null', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    expect(lc.pendingInit).toBeNull();
  });
});

describe('WasmProcessorLifecycle — initialize() success path', () => {
  test('returns true on successful init', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(true);
  });

  test('isReady becomes true after success', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    expect(lc.isReady).toBe(true);
  });

  test('hasFailed stays false after success', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    expect(lc.hasFailed).toBe(false);
  });

  test('calls fetchWasmBinary with configured URL', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    expect(fetchWasmBinary).toHaveBeenCalledWith(expect.any(URL));
  });

  test('calls verifyWasmBinaryIntegrity with binary', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    expect(verifyWasmBinaryIntegrity).toHaveBeenCalled();
  });

  test('calls instantiateFn with fetched binary', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const binary = new ArrayBuffer(16);
    vi.mocked(fetchWasmBinary).mockResolvedValueOnce(binary);
    const instantiateFn = makeInstantiateFn();
    await lc.initialize(instantiateFn);
    expect(instantiateFn).toHaveBeenCalledWith(binary);
  });

  test('calls verifyWasmInstance with the returned instance', async () => {
    const instance = { processTokens: vi.fn(), initialize: vi.fn() };
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn(instance));
    expect(verifyWasmInstance).toHaveBeenCalledWith(instance, expect.any(Array), 'TestProcessor');
  });
});

describe('WasmProcessorLifecycle — idempotency', () => {
  test('returns true immediately if already ready', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());

    vi.clearAllMocks(); // reset call counts
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(true);
    expect(fetchWasmBinary).not.toHaveBeenCalled(); // no re-init
  });

  test('concurrent initialize() calls share one promise', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const fn = makeInstantiateFn();
    const [r1, r2] = await Promise.all([lc.initialize(fn), lc.initialize(fn)]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1); // only one actual init
  });
});

describe('WasmProcessorLifecycle — hasFailed guard', () => {
  test('returns false immediately if hasFailed', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    lc.permanentlyFail();
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(false);
    expect(fetchWasmBinary).not.toHaveBeenCalled();
  });
});

describe('WasmProcessorLifecycle — permanentlyFail()', () => {
  test('sets hasFailed=true and isReady=false', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    lc.permanentlyFail();
    expect(lc.hasFailed).toBe(true);
    expect(lc.isReady).toBe(false);
  });

  test('permanentlyFail on already-ready lifecycle blocks re-init', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    lc.permanentlyFail();
    vi.clearAllMocks();
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(false);
    expect(fetchWasmBinary).not.toHaveBeenCalled();
  });
});

describe('WasmProcessorLifecycle — reset()', () => {
  test('clears state when not in cooldown', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const cleared = lc.reset();
    expect(cleared).toBe(true);
    expect(lc.isReady).toBe(false);
    expect(lc.hasFailed).toBe(false);
  });

  test('after reset(), initialize() can succeed again', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    lc.reset();
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(true);
    expect(lc.isReady).toBe(true);
  });
});

describe('WasmProcessorLifecycle — integrity check failure', () => {
  test('returns false when binary integrity check fails', async () => {
    vi.mocked(verifyWasmBinaryIntegrity).mockResolvedValue({
      valid: false,
      errors: ['Hash mismatch'],
      warnings: [],
    });
    const lc = new WasmProcessorLifecycle(makeConfig());
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(false);
    expect(lc.hasFailed).toBe(true);
  });

  test('returns false when instance verification fails', async () => {
    vi.mocked(verifyWasmInstance).mockReturnValue({
      valid: false,
      errors: ['Missing method: processTokens'],
    });
    const lc = new WasmProcessorLifecycle(makeConfig());
    const result = await lc.initialize(makeInstantiateFn());
    expect(result).toBe(false);
    expect(lc.hasFailed).toBe(true);
  });
});

describe('WasmProcessorLifecycle — getStatus()', () => {
  test('returns expected shape', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const status = lc.getStatus();
    expect(status).toMatchObject({
      name: 'TestProcessor',
      isReady: false,
      hasFailed: false,
      failureCount: 0,
      inCooldown: false,
    });
  });

  test('isReady updates in status after successful init', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());
    expect(lc.getStatus().isReady).toBe(true);
  });

  test('hasFailed updates in status after permanentlyFail', () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    lc.permanentlyFail();
    expect(lc.getStatus().hasFailed).toBe(true);
  });
});

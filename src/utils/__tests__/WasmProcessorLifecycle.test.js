import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { WasmProcessorLifecycle } from '../wasm/WasmProcessorLifecycle';

const makeConfig = (overrides = {}) => ({
  name: 'TestProcessor',
  expectedMethods: ['processTokens', 'initialize'],
  ...overrides,
});

const makeInstantiateFn = (instance = { processTokens: vi.fn(), initialize: vi.fn() }) =>
  vi.fn().mockResolvedValue(instance);

beforeEach(() => {
  vi.clearAllMocks();
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

  test('calls instantiateFn once', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const instantiateFn = makeInstantiateFn();
    await lc.initialize(instantiateFn);
    expect(instantiateFn).toHaveBeenCalledTimes(1);
  });
});

describe('WasmProcessorLifecycle — idempotency', () => {
  test('returns true immediately if already ready', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    await lc.initialize(makeInstantiateFn());

    const again = makeInstantiateFn();
    const result = await lc.initialize(again);
    expect(result).toBe(true);
    expect(again).not.toHaveBeenCalled(); // no re-init
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
    const instantiateFn = makeInstantiateFn();
    const result = await lc.initialize(instantiateFn);
    expect(result).toBe(false);
    expect(instantiateFn).not.toHaveBeenCalled();
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
    const instantiateFn = makeInstantiateFn();
    const result = await lc.initialize(instantiateFn);
    expect(result).toBe(false);
    expect(instantiateFn).not.toHaveBeenCalled();
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

describe('WasmProcessorLifecycle — instance verification failure', () => {
  test('returns false when the instance lacks an expected method', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const result = await lc.initialize(makeInstantiateFn({ initialize: vi.fn() }));
    expect(result).toBe(false);
    expect(lc.hasFailed).toBe(true);
    expect(lc.isReady).toBe(false);
  });

  test('returns false when instantiateFn hands back no instance', async () => {
    const lc = new WasmProcessorLifecycle(makeConfig());
    const result = await lc.initialize(vi.fn().mockResolvedValue(undefined));
    expect(result).toBe(false);
    expect(lc.hasFailed).toBe(true);
  });
});

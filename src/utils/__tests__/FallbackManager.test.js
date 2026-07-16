import { describe, test, expect, vi, beforeEach } from 'vitest';
import { FallbackManager } from '../FallbackManager';
import toast from '../toast';

vi.mock('../toast', () => ({
  default: { warning: vi.fn() },
}));
vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeManager(overrides = {}) {
  return new FallbackManager({
    systemName: 'Test System',
    maxFailures: 3,
    toastMessage: 'Falling back',
    toastId: 'test-fallback',
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('constructor', () => {
  test('throws when systemName is missing', () => {
    expect(() => new FallbackManager({ toastMessage: 'x', toastId: 'y' })).toThrow(
      'FallbackManager requires systemName option'
    );
  });

  test('throws when toastMessage is missing', () => {
    expect(() => new FallbackManager({ systemName: 'x', toastId: 'y' })).toThrow(
      'FallbackManager requires toastMessage option'
    );
  });

  test('throws when toastId is missing', () => {
    expect(() => new FallbackManager({ systemName: 'x', toastMessage: 'y' })).toThrow(
      'FallbackManager requires toastId option'
    );
  });

  test('defaults maxFailures to 3', () => {
    const manager = makeManager({ maxFailures: undefined });
    expect(manager.maxFailures).toBe(3);
  });
});

describe('recordFailure', () => {
  test('does not enter fallback mode before maxFailures is reached', () => {
    const manager = makeManager({ maxFailures: 3 });
    expect(manager.recordFailure()).toBe(false);
    expect(manager.recordFailure()).toBe(false);
    expect(manager.isInFallbackMode()).toBe(false);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test('enters fallback mode and returns true on the Nth consecutive failure', () => {
    const manager = makeManager({ maxFailures: 3 });
    manager.recordFailure();
    manager.recordFailure();
    expect(manager.recordFailure()).toBe(true);
    expect(manager.isInFallbackMode()).toBe(true);
  });

  test('shows the toast exactly once even across further failures', () => {
    const manager = makeManager({ maxFailures: 2, toastMessage: 'Falling back', toastId: 'id-1' });
    manager.recordFailure();
    manager.recordFailure(); // enters fallback, shows toast
    manager.recordFailure(); // still in fallback, must not toast again
    manager.recordFailure();

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('Falling back', {
      duration: expect.any(Number),
      id: 'id-1',
    });
  });

  test('subsequent failures after entering fallback mode return false (not a fresh transition)', () => {
    const manager = makeManager({ maxFailures: 2 });
    manager.recordFailure();
    expect(manager.recordFailure()).toBe(true); // transition
    expect(manager.recordFailure()).toBe(false); // already in fallback
  });
});

describe('recordSuccess', () => {
  test('resets the consecutive failure counter', () => {
    const manager = makeManager({ maxFailures: 5 });
    manager.recordFailure();
    manager.recordFailure();
    expect(manager.getFailureCount()).toBe(2);

    manager.recordSuccess();
    expect(manager.getFailureCount()).toBe(0);
  });

  test('does not exit fallback mode once entered', () => {
    const manager = makeManager({ maxFailures: 1 });
    manager.recordFailure(); // enters fallback mode
    expect(manager.isInFallbackMode()).toBe(true);

    manager.recordSuccess();
    expect(manager.isInFallbackMode()).toBe(true);
  });
});

describe('reset() vs exitFallbackMode()', () => {
  test('reset() clears the failure counter but leaves fallback mode and the warning flag untouched', () => {
    const manager = makeManager({ maxFailures: 1 });
    manager.recordFailure(); // fallbackMode=true, showedFallbackWarning=true
    manager.recordFailure(); // bump counter again while already in fallback

    manager.reset();

    expect(manager.getFailureCount()).toBe(0);
    expect(manager.isInFallbackMode()).toBe(true);
    expect(manager.getStatus().showedFallbackWarning).toBe(true);
  });

  test('exitFallbackMode() fully resets counter, fallback mode, and the warning flag', () => {
    const manager = makeManager({ maxFailures: 1 });
    manager.recordFailure(); // fallbackMode=true, showedFallbackWarning=true

    manager.exitFallbackMode();

    expect(manager.getFailureCount()).toBe(0);
    expect(manager.isInFallbackMode()).toBe(false);
    expect(manager.getStatus().showedFallbackWarning).toBe(false);
  });

  test('after exitFallbackMode(), a new failure streak can show the toast again', () => {
    const manager = makeManager({ maxFailures: 1, toastId: 'id-2' });
    manager.recordFailure();
    expect(toast.warning).toHaveBeenCalledTimes(1);

    manager.exitFallbackMode();
    manager.recordFailure();

    expect(toast.warning).toHaveBeenCalledTimes(2);
  });
});

describe('getStatus', () => {
  test('reflects current state', () => {
    const manager = makeManager({ systemName: 'My System', maxFailures: 2 });
    manager.recordFailure();

    expect(manager.getStatus()).toEqual({
      systemName: 'My System',
      consecutiveFailures: 1,
      maxFailures: 2,
      fallbackMode: false,
      showedFallbackWarning: false,
    });
  });
});

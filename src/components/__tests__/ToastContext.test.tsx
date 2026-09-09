/**
 * Tests for ToastContext's global escape hatch (the `toast.*` free functions used by
 * non-React callers). Covers the pending-call buffer: calls made before
 * `setGlobalToast` wires the real implementation must not be silently dropped.
 *
 * `globalToastFn`/`pendingToastCalls` are module-level state, so each test resets
 * modules and re-imports fresh to start from an unwired module every time.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

function makeMockToastImpl() {
  return {
    showToast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    removeToast: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('ToastContext global toast buffer', () => {
  test('calls made before setGlobalToast do not fire immediately, and replay once wired', async () => {
    const { toast, setGlobalToast } = await import('../ToastContext');
    const impl = makeMockToastImpl();

    toast.success('queued message', 4000, 'custom-1');
    expect(impl.success).not.toHaveBeenCalled();

    setGlobalToast(impl as unknown as Parameters<typeof setGlobalToast>[0]);

    expect(impl.success).toHaveBeenCalledWith('queued message', 4000, 'custom-1');
  });

  test('calls made after wiring fire immediately', async () => {
    const { toast, setGlobalToast } = await import('../ToastContext');
    const impl = makeMockToastImpl();
    setGlobalToast(impl as unknown as Parameters<typeof setGlobalToast>[0]);

    toast.error('immediate message', 5000, 'custom-2');

    expect(impl.error).toHaveBeenCalledWith('immediate message', 5000, 'custom-2');
  });

  test('a second setGlobalToast call with an empty queue does not replay stale calls', async () => {
    const { toast, setGlobalToast } = await import('../ToastContext');
    const implA = makeMockToastImpl();
    setGlobalToast(implA as unknown as Parameters<typeof setGlobalToast>[0]);
    toast.warning('handled by A', 3000);
    expect(implA.warning).toHaveBeenCalledTimes(1);

    const implB = makeMockToastImpl();
    setGlobalToast(implB as unknown as Parameters<typeof setGlobalToast>[0]);

    // Queue was empty at the time of this second wiring — B must not receive A's call.
    expect(implB.warning).not.toHaveBeenCalled();
  });

  test('show() queues and replays through showToast', async () => {
    const { toast, setGlobalToast } = await import('../ToastContext');
    const impl = makeMockToastImpl();

    toast.show('queued show', 'warning', 2000, 'custom-3');
    expect(impl.showToast).not.toHaveBeenCalled();

    setGlobalToast(impl as unknown as Parameters<typeof setGlobalToast>[0]);

    expect(impl.showToast).toHaveBeenCalledWith('queued show', 'warning', 2000, 'custom-3');
  });

  test('multiple pre-wiring calls replay in order', async () => {
    const { toast, setGlobalToast } = await import('../ToastContext');
    const impl = makeMockToastImpl();
    const order: string[] = [];
    impl.success.mockImplementation(() => order.push('success'));
    impl.error.mockImplementation(() => order.push('error'));

    toast.success('first');
    toast.error('second');
    setGlobalToast(impl as unknown as Parameters<typeof setGlobalToast>[0]);

    expect(order).toEqual(['success', 'error']);
  });
});

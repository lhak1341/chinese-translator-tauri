import { describe, it, expect, vi } from 'vitest';
import { buildScrollRestoreAttempt, SCROLL_RESTORE_MAX_ATTEMPTS } from '../useVirtualScrollRange';

function makeRef(container: Partial<HTMLDivElement> | null) {
  return { current: container as HTMLDivElement | null };
}

describe('buildScrollRestoreAttempt', () => {
  it('returns false when the container ref is not yet set', () => {
    const ref = makeRef(null);
    const setScrollTop = vi.fn();
    const attemptFn = buildScrollRestoreAttempt(ref, 400, setScrollTop);

    expect(attemptFn(400)).toBe(false);
    expect(setScrollTop).not.toHaveBeenCalled();
  });

  it('returns false for the first 3 attempts even if scrollHeight is already > 0', () => {
    const ref = makeRef({ scrollHeight: 1000, scrollTop: 0 });
    const setScrollTop = vi.fn();
    const attemptFn = buildScrollRestoreAttempt(ref, 400, setScrollTop);

    expect(attemptFn(400)).toBe(false); // attempt 1
    expect(attemptFn(400)).toBe(false); // attempt 2
    expect(attemptFn(400)).toBe(false); // attempt 3
    expect(setScrollTop).not.toHaveBeenCalled();
  });

  it('writes the position and returns true once scrollHeight > 0 past attempt 3', () => {
    const container: Partial<HTMLDivElement> = { scrollHeight: 0, scrollTop: 0 };
    const ref = makeRef(container);
    const setScrollTop = vi.fn();
    const attemptFn = buildScrollRestoreAttempt(ref, 400, setScrollTop);

    expect(attemptFn(400)).toBe(false); // 1: not ready (also scrollHeight 0)
    expect(attemptFn(400)).toBe(false); // 2
    expect(attemptFn(400)).toBe(false); // 3
    container.scrollHeight = 1000; // container has laid out by attempt 4
    expect(attemptFn(400)).toBe(true); // 4: ready
    expect(container.scrollTop).toBe(400);
    expect(setScrollTop).toHaveBeenCalledWith(400);
  });

  it('force-writes on the final permitted attempt even if never ready', () => {
    const container: Partial<HTMLDivElement> = { scrollHeight: 0, scrollTop: 0 };
    const ref = makeRef(container);
    const setScrollTop = vi.fn();
    const attemptFn = buildScrollRestoreAttempt(ref, 400, setScrollTop);

    let result = false;
    for (let i = 0; i < SCROLL_RESTORE_MAX_ATTEMPTS; i++) {
      result = attemptFn(400);
    }

    expect(result).toBe(true);
    expect(container.scrollTop).toBe(400);
    expect(setScrollTop).toHaveBeenCalledTimes(1);
    expect(setScrollTop).toHaveBeenCalledWith(400);
  });

  it('does not force-write one attempt before the final permitted attempt', () => {
    const container: Partial<HTMLDivElement> = { scrollHeight: 0, scrollTop: 0 };
    const ref = makeRef(container);
    const setScrollTop = vi.fn();
    const attemptFn = buildScrollRestoreAttempt(ref, 400, setScrollTop);

    let result = false;
    for (let i = 0; i < SCROLL_RESTORE_MAX_ATTEMPTS - 1; i++) {
      result = attemptFn(400);
    }

    expect(result).toBe(false);
    expect(setScrollTop).not.toHaveBeenCalled();
  });

  it('tracks its own attempt count independently across multiple built instances', () => {
    const ref = makeRef({ scrollHeight: 1000, scrollTop: 0 });
    const first = buildScrollRestoreAttempt(ref, 100, vi.fn());
    const second = buildScrollRestoreAttempt(ref, 200, vi.fn());

    expect(first(100)).toBe(false); // attempt 1 for `first`
    expect(first(100)).toBe(false); // attempt 2 for `first`
    // `second` starts its own count at 1, unaffected by `first`'s progress.
    expect(second(200)).toBe(false);
  });
});

/**
 * Direct tests for ScrollHelpers (src/utils/highlighting/ScrollHelpers.ts), specifically
 * scheduleHighlightScroll — extracted from 3 near-identical duplicated blocks in
 * Translator.jsx::handleSemanticSegmentClick (architecture review 2026-07-18, candidate 4).
 * scrollToHighlightedElement itself was already exercised only implicitly; these tests cover
 * the new mount-guarded scheduling wrapper.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MutableRefObject, RefObject } from 'react';
import { scheduleHighlightScroll } from '../highlighting/ScrollHelpers';

function makeContainerRef(unitIndex: number): RefObject<HTMLElement> {
  const el = document.createElement('div');
  const child = document.createElement('span');
  child.setAttribute('data-unit-index', String(unitIndex));
  el.appendChild(child);
  // jsdom does not implement scrollIntoView
  child.scrollIntoView = vi.fn();
  return { current: el } as RefObject<HTMLElement>;
}

function makeTimeoutRef(): MutableRefObject<ReturnType<typeof setTimeout> | null> {
  return { current: null };
}

function makeMountedRef(mounted: boolean): RefObject<boolean> {
  return { current: mounted } as RefObject<boolean>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduleHighlightScroll', () => {
  test('does not schedule when unmounted at call time', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(false);
    const ref = makeContainerRef(5);

    scheduleHighlightScroll(timeoutRef, isMountedRef, [ref], 5, 10);
    vi.advanceTimersByTime(10);

    expect(timeoutRef.current).toBeNull();
    expect(
      ref.current!.querySelector('[data-unit-index="5"]')!.scrollIntoView
    ).not.toHaveBeenCalled();
  });

  test('schedules and fires the scroll after the delay when mounted throughout', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(true);
    const ref = makeContainerRef(5);

    scheduleHighlightScroll(timeoutRef, isMountedRef, [ref], 5, 10);
    expect(timeoutRef.current).not.toBeNull();

    vi.advanceTimersByTime(10);

    expect(
      ref.current!.querySelector('[data-unit-index="5"]')!.scrollIntoView
    ).toHaveBeenCalledTimes(1);
    expect(timeoutRef.current).toBeNull(); // nulled after firing
  });

  test('does not fire the scroll if unmounted before the delay elapses', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(true);
    const ref = makeContainerRef(5);

    scheduleHighlightScroll(timeoutRef, isMountedRef, [ref], 5, 10);
    (isMountedRef as MutableRefObject<boolean>).current = false; // unmount mid-delay
    vi.advanceTimersByTime(10);

    expect(
      ref.current!.querySelector('[data-unit-index="5"]')!.scrollIntoView
    ).not.toHaveBeenCalled();
  });

  test('clears a previously-pending timeout before scheduling a new one', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(true);
    const refA = makeContainerRef(1);
    const refB = makeContainerRef(2);

    scheduleHighlightScroll(timeoutRef, isMountedRef, [refA], 1, 10);
    scheduleHighlightScroll(timeoutRef, isMountedRef, [refB], 2, 10); // supersedes the first

    vi.advanceTimersByTime(10);

    expect(
      refA.current!.querySelector('[data-unit-index="1"]')!.scrollIntoView
    ).not.toHaveBeenCalled();
    expect(
      refB.current!.querySelector('[data-unit-index="2"]')!.scrollIntoView
    ).toHaveBeenCalledTimes(1);
  });

  test('calls scrollToHighlightedElement once per ref, all with the same targetIndex', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(true);
    const refA = makeContainerRef(7);
    const refB = makeContainerRef(7);

    scheduleHighlightScroll(timeoutRef, isMountedRef, [refA, refB], 7, 10);
    vi.advanceTimersByTime(10);

    expect(
      refA.current!.querySelector('[data-unit-index="7"]')!.scrollIntoView
    ).toHaveBeenCalledTimes(1);
    expect(
      refB.current!.querySelector('[data-unit-index="7"]')!.scrollIntoView
    ).toHaveBeenCalledTimes(1);
  });

  test('an empty refs array schedules and fires without error', () => {
    const timeoutRef = makeTimeoutRef();
    const isMountedRef = makeMountedRef(true);

    expect(() => {
      scheduleHighlightScroll(timeoutRef, isMountedRef, [], 3, 10);
      vi.advanceTimersByTime(10);
    }).not.toThrow();
    expect(timeoutRef.current).toBeNull();
  });
});

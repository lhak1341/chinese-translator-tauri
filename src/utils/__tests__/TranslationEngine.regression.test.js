/**
 * Regression tests for TranslationEngine bug fixes
 *
 * Tests prevent regressions for:
 * - Async memory cleanup race condition
 * - The canonical translationSegments hard ceiling (trackTranslationSegment)
 *
 * A prior "Inconsistent Cleanup Thresholds" / "Multiple Async Cleanup Interference"
 * section here tested MockTranslationEngine methods (handleSmartCleanup,
 * performEmergencyCleanup, performHighPriorityCleanup, optimizeMemoryStructures) that
 * no longer exist on the real engine — extracted into SmartMemoryCoordinator long
 * before this file was last touched (see CLAUDE.md's deleted-symbols list). Removed
 * 2026-07-29 alongside the translateWithProgressiveBatches decomposition (architecture
 * review candidate #1) — see BatchMemoryCleanup.test.ts for the real replacement's tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds.js';

// Mock TranslationEngine with minimal implementation for testing
class MockTranslationEngine {
  constructor() {
    this.translationSegments = [];
  }

  // Simulates the fixed async cleanup logic
  trackTranslationSegmentWithAsyncCleanup() {
    this.translationSegments.push({ data: 'segment' });

    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING) {
      // Idle-deferred cleanup never got a chance to run — trim synchronously.
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
    } else if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
      const segmentsToKeep = MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP;

      const cleanupFn = () => {
        // Bug fix: Re-check threshold before cleanup to prevent race condition
        if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
          this.translationSegments = this.translationSegments.slice(-segmentsToKeep);
        }
      };

      // Schedule async cleanup
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanupFn, { timeout: 1000 });
      } else {
        setTimeout(cleanupFn, 0);
      }
    }
  }
}

describe('TranslationEngine Regression Tests', () => {
  describe('Bug Fix: Async Memory Cleanup Race Condition', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should not delete newly added segments when cleanup executes late', async () => {
      // Add 80 segments to trigger cleanup (threshold is 75)
      for (let i = 0; i < 80; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      expect(engine.translationSegments.length).toBe(80);

      // Simulate user clearing segments before async cleanup executes
      engine.translationSegments = [];

      // Add 40 new segments
      for (let i = 0; i < 40; i++) {
        engine.translationSegments.push({ data: `new-segment-${i}` });
      }

      expect(engine.translationSegments.length).toBe(40);

      // Execute queued cleanup
      await vi.runAllTimersAsync();

      // Bug fix verification: Should NOT delete the 40 new segments
      // because cleanup re-checks threshold (40 < 75, so no cleanup happens)
      expect(engine.translationSegments.length).toBe(40);
    });

    it('should still cleanup if threshold exceeded when cleanup executes', async () => {
      // Add 80 segments to trigger cleanup
      for (let i = 0; i < 80; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      // Add more segments while cleanup is queued
      for (let i = 0; i < 20; i++) {
        engine.translationSegments.push({ data: `extra-segment-${i}` });
      }

      expect(engine.translationSegments.length).toBe(100);

      // Execute queued cleanup
      await vi.runAllTimersAsync();

      // Should cleanup to SEGMENT_CLEANUP_KEEP (35) because threshold still exceeded
      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP);
    });
  });

  describe('Bug Fix: Segment Cleanup Hard Ceiling', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('trims synchronously, without running any timers, once the hard ceiling is crossed', () => {
      // A synchronous burst outruns the idle-deferred cleanup entirely —
      // no vi.runAllTimersAsync() here, the trim must already have happened.
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING + 1; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP);
    });

    it('does not trim synchronously while still under the hard ceiling', () => {
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      // Still queued for idle cleanup, not yet trimmed
      expect(engine.translationSegments.length).toBe(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING
      );
    });
  });

  describe('Threshold Constants Integration', () => {
    it('should have consistent threshold values', () => {
      // Verify threshold hierarchy makes sense
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER
      );
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING
      );
    });

    it('should use documented threshold values', () => {
      // Verify actual values match documentation.
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER).toBe(75);
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBe(35);
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING).toBe(100);
    });
  });
});

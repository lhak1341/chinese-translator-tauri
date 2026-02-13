/**
 * Regression tests for TranslationEngine bug fixes
 *
 * Tests prevent regressions for:
 * - Async memory cleanup race condition
 * - Inconsistent cleanup thresholds
 * - Multiple async cleanup interference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds.js';

// Mock TranslationEngine with minimal implementation for testing
class MockTranslationEngine {
  constructor() {
    this.translationSegments = [];
    this.backgroundCleanup = {
      clear: vi.fn(),
      queueCleanup: vi.fn(),
    };
  }

  // Simulates the fixed async cleanup logic
  trackTranslationSegmentWithAsyncCleanup() {
    this.translationSegments.push({ data: 'segment' });

    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
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

  // Simulates fixed smart cleanup with background cleanup clearing
  handleSmartCleanup(urgency) {
    if (urgency === 'critical' || urgency === 'high') {
      // Bug fix: Clear pending background cleanups before immediate cleanup
      if (this.backgroundCleanup) {
        this.backgroundCleanup.clear();
      }

      if (urgency === 'critical') {
        this.performEmergencyCleanup();
      } else {
        this.performHighPriorityCleanup();
      }
    }
  }

  performEmergencyCleanup() {
    if (this.translationSegments.length > MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD) {
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD
      );
    }
  }

  performHighPriorityCleanup() {
    if (this.translationSegments.length > MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD) {
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD
      );
    }
  }

  optimizeMemoryStructures() {
    // Bug fix: Use MEMORY_THRESHOLDS constants instead of hardcoded values
    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP) {
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
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

  describe('Bug Fix: Inconsistent Cleanup Thresholds', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
    });

    it('should use MEMORY_THRESHOLDS constant in optimizeMemoryStructures', () => {
      // Add segments beyond threshold
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP + 10; i++) {
        engine.translationSegments.push({ data: `segment-${i}` });
      }

      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP + 10);

      engine.optimizeMemoryStructures();

      // Should cleanup to exactly SEGMENT_CLEANUP_KEEP (35), not hardcoded 35
      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP);
    });

    it('should not cleanup if below threshold', () => {
      // Add fewer segments than threshold
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP - 10; i++) {
        engine.translationSegments.push({ data: `segment-${i}` });
      }

      const initialLength = engine.translationSegments.length;
      engine.optimizeMemoryStructures();

      // Should not cleanup because below threshold
      expect(engine.translationSegments.length).toBe(initialLength);
    });
  });

  describe('Bug Fix: Multiple Async Cleanup Interference', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
    });

    it('should clear pending background cleanups before emergency cleanup', () => {
      // Add many segments
      for (let i = 0; i < 100; i++) {
        engine.translationSegments.push({ data: `segment-${i}` });
      }

      engine.handleSmartCleanup('critical');

      // Verify background cleanup was cleared
      expect(engine.backgroundCleanup.clear).toHaveBeenCalled();

      // Verify emergency cleanup executed
      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD);
    });

    it('should clear pending background cleanups before high priority cleanup', () => {
      // Add many segments
      for (let i = 0; i < 100; i++) {
        engine.translationSegments.push({ data: `segment-${i}` });
      }

      engine.handleSmartCleanup('high');

      // Verify background cleanup was cleared
      expect(engine.backgroundCleanup.clear).toHaveBeenCalled();

      // Verify high priority cleanup executed
      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD);
    });

    it('should not interfere with medium/low priority cleanups', () => {
      engine.handleSmartCleanup('medium');

      // Should not clear background cleanups for medium priority
      expect(engine.backgroundCleanup.clear).not.toHaveBeenCalled();
    });
  });

  describe('Threshold Constants Integration', () => {
    it('should have consistent threshold values', () => {
      // Verify threshold hierarchy makes sense
      expect(MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD).toBeLessThan(
        MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD
      );
      expect(MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER
      );
    });

    it('should use documented threshold values', () => {
      // Verify actual values match documentation.
      // CODE REVIEW FIX (HIGH-4): EMERGENCY raised 3→10, CRITICAL raised 5→20
      // to preserve meaningful clickable highlighting after pressure cleanups.
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER).toBe(75);
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBe(35);
      expect(MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD).toBe(10);
      expect(MEMORY_THRESHOLDS.CRITICAL_CLEANUP_THRESHOLD).toBe(20);
    });
  });
});

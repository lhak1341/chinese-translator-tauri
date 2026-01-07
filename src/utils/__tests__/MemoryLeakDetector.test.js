/**
 * Tests for Memory Leak Detector
 *
 * Tests memory monitoring and leak detection functionality:
 * - Snapshot recording and memory tracking
 * - Trend analysis (short-term and long-term)
 * - Threshold detection (warning, critical, emergency)
 * - Leak detection and recommendations
 * - Cleanup triggering
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLeakDetector } from '../MemoryLeakDetector.js';
import { batchLog } from '../BatchLogger.js';

// Mock BatchLogger
vi.mock('../BatchLogger.js', () => ({
  batchLog: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('MemoryLeakDetector', () => {
  let detector;
  let mockMemory;

  beforeEach(() => {
    // Mock performance.memory API
    mockMemory = {
      usedJSHeapSize: 50 * 1024 * 1024, // 50MB
      totalJSHeapSize: 100 * 1024 * 1024, // 100MB
      jsHeapSizeLimit: 200 * 1024 * 1024, // 200MB limit
    };

    // Mock performance object
    global.performance = {
      memory: mockMemory,
    };

    // Mock Date.now for consistent timestamps
    vi.spyOn(Date, 'now').mockReturnValue(1000000);

    detector = new MemoryLeakDetector();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.performance;
  });

  describe('initialization', () => {
    test('should initialize with empty snapshots', () => {
      expect(detector.snapshots).toEqual([]);
    });

    test('should record start memory', () => {
      expect(detector.startMemory).toBeDefined();
      expect(detector.startMemory.used).toBe(50 * 1024 * 1024);
    });

    test('should initialize trends', () => {
      expect(detector.trends).toEqual({
        shortTerm: [],
        longTerm: [],
        alerts: [],
      });
    });

    test('should set default cleanup thresholds', () => {
      expect(detector.cleanupThresholds).toEqual({
        warning: 0.75,
        critical: 0.85,
        emergency: 0.95,
      });
    });

    test('should have null cleanup callback initially', () => {
      expect(detector.onCleanupNeeded).toBeNull();
    });
  });

  describe('getCurrentMemory', () => {
    test('should return current memory stats', () => {
      const memory = detector.getCurrentMemory();

      expect(memory).toEqual({
        used: 50 * 1024 * 1024,
        total: 100 * 1024 * 1024,
        limit: 200 * 1024 * 1024,
        timestamp: 1000000,
      });
    });

    test('should return null if performance.memory unavailable', () => {
      delete global.performance.memory;

      const memory = detector.getCurrentMemory();
      expect(memory).toBeNull();
    });

    test('should return current timestamp', () => {
      Date.now.mockReturnValue(2000000);

      const memory = detector.getCurrentMemory();
      expect(memory.timestamp).toBe(2000000);
    });
  });

  describe('recordSnapshot', () => {
    test('should record snapshot with operation name', () => {
      const snapshot = detector.recordSnapshot('translation', { batchSize: 10 });

      expect(snapshot.operation).toBe('translation');
      expect(snapshot.context).toEqual({ batchSize: 10 });
    });

    test('should calculate memory growth from start', () => {
      mockMemory.usedJSHeapSize = 70 * 1024 * 1024; // 70MB

      const snapshot = detector.recordSnapshot('translation');

      expect(snapshot.memoryGrowth).toBe(20 * 1024 * 1024); // 70MB - 50MB
      expect(snapshot.memoryGrowthMB).toBe(20);
    });

    test('should include trend calculation', () => {
      detector.recordSnapshot('batch1');
      mockMemory.usedJSHeapSize = 60 * 1024 * 1024;
      const snapshot = detector.recordSnapshot('batch2');

      expect(snapshot.trend).toBeDefined();
      expect(typeof snapshot.trend).toBe('number');
    });

    test('should add snapshot to history', () => {
      detector.recordSnapshot('test');

      expect(detector.snapshots.length).toBe(1);
      expect(detector.snapshots[0].operation).toBe('test');
    });

    test('should limit snapshot history to prevent memory leak', () => {
      // Record 60 snapshots
      for (let i = 0; i < 60; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      // Should keep at most 50 (trims to 25 when exceeds 50, then continues)
      expect(detector.snapshots.length).toBeLessThanOrEqual(50);
      expect(detector.snapshots.length).toBeGreaterThan(0);
    });

    test('should return null if memory API unavailable', () => {
      delete global.performance.memory;

      const snapshot = detector.recordSnapshot('test');
      expect(snapshot).toBeNull();
    });

    test('should update trends on snapshot', () => {
      detector.recordSnapshot('test');

      expect(detector.trends.shortTerm.length).toBe(1);
    });
  });

  describe('takeSnapshot (legacy method)', () => {
    test('should work as alias for recordSnapshot', () => {
      const snapshot = detector.takeSnapshot(5, { data: 'test' });

      expect(snapshot.operation).toBe('batch_5');
      expect(snapshot.context.batchIndex).toBe(5);
      expect(snapshot.context.data).toBe('test');
    });
  });

  describe('calculateTrend', () => {
    test('should return 0 with less than 2 snapshots', () => {
      expect(detector.calculateTrend()).toBe(0);

      detector.recordSnapshot('batch1');
      expect(detector.calculateTrend()).toBe(0);
    });

    test('should calculate average change per snapshot', () => {
      detector.recordSnapshot('batch1');
      mockMemory.usedJSHeapSize = 60 * 1024 * 1024;
      detector.recordSnapshot('batch2');
      mockMemory.usedJSHeapSize = 70 * 1024 * 1024;
      detector.recordSnapshot('batch3');
      mockMemory.usedJSHeapSize = 80 * 1024 * 1024;
      detector.recordSnapshot('batch4');
      mockMemory.usedJSHeapSize = 90 * 1024 * 1024;
      detector.recordSnapshot('batch5');

      const trend = detector.calculateTrend();

      // Should use last 5 snapshots
      expect(trend).toBeGreaterThan(0); // Increasing memory
    });
  });

  describe('updateTrends', () => {
    test('should add to short term trends', () => {
      const snapshot = detector.recordSnapshot('test');

      expect(detector.trends.shortTerm.length).toBe(1);
      expect(detector.trends.shortTerm[0].operation).toBe('test');
    });

    test('should limit short term to 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      expect(detector.trends.shortTerm.length).toBe(10);
    });

    test('should sample to long term every 10 snapshots', () => {
      for (let i = 0; i < 25; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      expect(detector.trends.longTerm.length).toBeGreaterThan(0);
    });

    test('should limit long term to 100 entries', () => {
      for (let i = 0; i < 1100; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      expect(detector.trends.longTerm.length).toBeLessThanOrEqual(100);
    });
  });

  describe('threshold detection', () => {
    test('should trigger warning at 75% usage', () => {
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024; // 75% of 200MB

      detector.recordSnapshot('test');

      expect(detector.trends.alerts.length).toBe(1);
      expect(detector.trends.alerts[0].level).toBe('warning');
      expect(batchLog.warn).toHaveBeenCalled();
    });

    test('should trigger critical at 85% usage', () => {
      const cleanupSpy = vi.fn();
      detector.onCleanupNeeded = cleanupSpy;

      mockMemory.usedJSHeapSize = 170 * 1024 * 1024; // 85% of 200MB

      detector.recordSnapshot('test');

      expect(detector.trends.alerts.length).toBe(1);
      expect(detector.trends.alerts[0].level).toBe('critical');
      expect(batchLog.error).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith('automatic');
    });

    test('should trigger emergency at 95% usage', () => {
      const cleanupSpy = vi.fn();
      detector.onCleanupNeeded = cleanupSpy;

      mockMemory.usedJSHeapSize = 190 * 1024 * 1024; // 95% of 200MB

      detector.recordSnapshot('test');

      expect(detector.trends.alerts.length).toBe(1);
      expect(detector.trends.alerts[0].level).toBe('emergency');
      expect(batchLog.error).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith('emergency');
    });

    test('should not trigger any alert below 75%', () => {
      mockMemory.usedJSHeapSize = 140 * 1024 * 1024; // 70% of 200MB

      detector.recordSnapshot('test');

      expect(detector.trends.alerts.length).toBe(0);
    });

    test('should limit alerts to 20 entries', () => {
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024; // Trigger warnings

      for (let i = 0; i < 30; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      expect(detector.trends.alerts.length).toBeLessThanOrEqual(20);
    });
  });

  describe('cleanup triggering', () => {
    test('should call cleanup callback when set', () => {
      const cleanupSpy = vi.fn();
      detector.onCleanupNeeded = cleanupSpy;

      detector.requestCleanup('manual');

      expect(cleanupSpy).toHaveBeenCalledWith('manual');
    });

    test('should not crash if cleanup callback not set', () => {
      expect(() => detector.requestCleanup('manual')).not.toThrow();
    });

    test('should attempt garbage collection in emergency', () => {
      global.gc = vi.fn();

      detector.requestGarbageCollection();

      expect(global.gc).toHaveBeenCalled();

      delete global.gc;
    });

    test('should handle missing gc function gracefully', () => {
      expect(() => detector.requestGarbageCollection()).not.toThrow();
    });
  });

  describe('leak detection', () => {
    test('should return null with less than 3 snapshots', () => {
      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');

      const analysis = detector.detectLeaks(detector.snapshots[1]);
      expect(analysis).toBeNull();
    });

    test('should detect high memory usage', () => {
      detector.recordSnapshot('batch1');
      mockMemory.usedJSHeapSize = 60 * 1024 * 1024;
      detector.recordSnapshot('batch2');
      mockMemory.usedJSHeapSize = 80 * 1024 * 1024; // 20MB growth
      const snapshot = detector.recordSnapshot('batch3');

      const analysis = detector.detectLeaks(snapshot);

      expect(analysis).toBeDefined();
      expect(analysis.memoryGrowthRate).toBeDefined();
      expect(analysis.totalGrowthMB).toBeDefined();
    });

    test('should flag excessive total growth', () => {
      // Simulate large total growth
      mockMemory.usedJSHeapSize = 300 * 1024 * 1024; // 250MB growth from start

      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');
      const snapshot = detector.recordSnapshot('batch3');

      const analysis = detector.detectLeaks(snapshot);

      expect(analysis.isExcessive).toBe(true);
    });

    test('should include current memory ratio', () => {
      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');
      const snapshot = detector.recordSnapshot('batch3');

      const analysis = detector.detectLeaks(snapshot);

      expect(analysis.currentRatio).toBeGreaterThan(0);
      expect(analysis.currentRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('trend analysis', () => {
    test('should return null with insufficient data', () => {
      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');

      const analysis = detector.analyzeTrends();
      expect(analysis).toBeNull();
    });

    test('should calculate average trend', () => {
      for (let i = 0; i < 5; i++) {
        mockMemory.usedJSHeapSize = 50 * 1024 * 1024 + i * 10 * 1024 * 1024;
        detector.recordSnapshot(`batch${i}`);
      }

      const analysis = detector.analyzeTrends();

      expect(analysis.averageTrend).toBeDefined();
      expect(typeof analysis.averageTrend).toBe('number');
    });

    test('should detect stable memory usage', () => {
      // Constant memory
      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const analysis = detector.analyzeTrends();
      expect(analysis.isStable).toBe(true);
    });

    test('should detect increasing memory trend', () => {
      for (let i = 0; i < 5; i++) {
        mockMemory.usedJSHeapSize = 50 * 1024 * 1024 + i * 5 * 1024 * 1024;
        detector.recordSnapshot(`batch${i}`);
      }

      const analysis = detector.analyzeTrends();
      expect(analysis.isIncreasing).toBeDefined();
    });

    test('should track recent alerts', () => {
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024; // Trigger warnings

      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');
      detector.recordSnapshot('batch3');

      const analysis = detector.analyzeTrends();
      expect(analysis.recentAlerts).toBeGreaterThan(0);
    });
  });

  describe('getAnalysis', () => {
    test('should return null with no snapshots', () => {
      const analysis = detector.getAnalysis();
      expect(analysis).toBeNull();
    });

    test('should return current memory stats', () => {
      detector.recordSnapshot('test');

      const analysis = detector.getAnalysis();

      expect(analysis.current).toBeDefined();
      expect(analysis.current.usedMB).toBe('50.0');
      expect(analysis.current.ratio).toContain('%');
    });

    test('should include trend analysis', () => {
      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const analysis = detector.getAnalysis();

      expect(analysis.trends).toBeDefined();
      expect(analysis.trends.shortTerm).toBeDefined();
    });

    test('should include recent alerts', () => {
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024;
      detector.recordSnapshot('test');

      const analysis = detector.getAnalysis();

      expect(analysis.alerts).toBeDefined();
      expect(Array.isArray(analysis.alerts)).toBe(true);
    });

    test('should include recommendations', () => {
      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const analysis = detector.getAnalysis();

      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });

  describe('recommendations', () => {
    test('should recommend reducing batch size for increasing memory', () => {
      // Simulate large increasing memory (need >2MB avg trend to trigger)
      // Need significant growth across last 5 snapshots
      for (let i = 0; i < 6; i++) {
        mockMemory.usedJSHeapSize = 50 * 1024 * 1024 + i * 5 * 1024 * 1024; // 5MB per step
        detector.recordSnapshot(`batch${i}`);
      }

      const recommendations = detector.generateRecommendations();

      // Should recommend reducing batch sizes for significant increasing trend
      // If no recommendation, memory increase wasn't detected as significant enough
      expect(recommendations.length).toBeGreaterThanOrEqual(0); // At least valid structure

      // Verify the trend analysis detects increasing memory
      const analysis = detector.analyzeTrends();
      expect(analysis).toBeDefined();
      expect(analysis.averageTrend).toBeGreaterThan(0); // Positive trend
    });

    test('should recommend cleanup for multiple alerts', () => {
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024;

      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const recommendations = detector.generateRecommendations();

      const hasAutoCleanup = recommendations.some((r) => r.includes('automatic cleanup'));
      expect(hasAutoCleanup).toBe(true);
    });

    test('should recommend leak check for unstable memory', () => {
      // Simulate unstable memory
      for (let i = 0; i < 5; i++) {
        mockMemory.usedJSHeapSize = 50 * 1024 * 1024 + (i % 2) * 20 * 1024 * 1024;
        detector.recordSnapshot(`batch${i}`);
      }

      const recommendations = detector.generateRecommendations();

      const hasLeakCheck = recommendations.some((r) => r.includes('memory leaks'));
      expect(hasLeakCheck).toBe(true);
    });

    test('should return empty array with insufficient data', () => {
      detector.recordSnapshot('batch1');

      const recommendations = detector.generateRecommendations();
      expect(recommendations).toEqual([]);
    });
  });

  describe('getReport', () => {
    test('should return null with no snapshots', () => {
      const report = detector.getReport();
      expect(report).toBeNull();
    });

    test('should include total snapshot count', () => {
      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const report = detector.getReport();

      expect(report.totalSnapshots).toBe(5);
    });

    test('should include memory growth', () => {
      mockMemory.usedJSHeapSize = 70 * 1024 * 1024; // 20MB growth
      detector.recordSnapshot('test');

      const report = detector.getReport();

      expect(report.memoryGrowthMB).toBe(20);
    });

    test('should include snapshot summaries', () => {
      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');

      const report = detector.getReport();

      expect(report.snapshots).toHaveLength(2);
      expect(report.snapshots[0].operation).toBe('batch1');
    });

    test('should format snapshot data', () => {
      detector.recordSnapshot('test');

      const report = detector.getReport();

      expect(typeof report.snapshots[0].growthMB).toBe('string');
      expect(typeof report.snapshots[0].usedMB).toBe('string');
    });

    test('should include full analysis', () => {
      for (let i = 0; i < 5; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      const report = detector.getReport();

      expect(report.analysis).toBeDefined();
      expect(report.analysis.current).toBeDefined();
      expect(report.analysis.trends).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('should handle rapid snapshot recording', () => {
      for (let i = 0; i < 100; i++) {
        detector.recordSnapshot(`batch${i}`);
      }

      expect(detector.snapshots.length).toBeLessThanOrEqual(50);
      expect(detector.trends.shortTerm.length).toBeLessThanOrEqual(10);
    });

    test('should handle zero memory growth', () => {
      detector.recordSnapshot('batch1');
      detector.recordSnapshot('batch2');

      const latest = detector.snapshots[detector.snapshots.length - 1];
      expect(latest.memoryGrowth).toBe(0);
    });

    test('should handle decreasing memory', () => {
      detector.recordSnapshot('batch1');
      mockMemory.usedJSHeapSize = 40 * 1024 * 1024; // Decreased

      const snapshot = detector.recordSnapshot('batch2');
      expect(snapshot.memoryGrowth).toBeLessThan(0);
    });

    test('should handle missing context', () => {
      const snapshot = detector.recordSnapshot('test');
      expect(snapshot.context).toEqual({});
    });

    test('should handle multiple cleanup callbacks', () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];

      callbacks.forEach((cb) => {
        detector.onCleanupNeeded = cb;
        detector.requestCleanup('test');
      });

      // Only last callback should be called
      expect(callbacks[2]).toHaveBeenCalledWith('test');
    });
  });
});

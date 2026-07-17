import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceBaselineTracker } from '../performance/PerformanceBaselineTracker.js';

describe('PerformanceBaselineTracker', () => {
  let tracker;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    tracker = new PerformanceBaselineTracker();
  });

  afterEach(() => {
    tracker.destroy();
    vi.restoreAllMocks();
  });

  const record = (type, overrides = {}) =>
    tracker.recordPerformance(type, {
      duration: 100,
      memoryUsed: 1000,
      cacheHitRate: 0.9,
      ...overrides,
    });

  describe('recordPerformance', () => {
    it('appends a data point with operationType, timestamp, sessionAge', () => {
      record('op');
      expect(tracker.performanceHistory).toHaveLength(1);
      const point = tracker.performanceHistory[0];
      expect(point.operationType).toBe('op');
      expect(point.duration).toBe(100);
      expect(typeof point.timestamp).toBe('number');
      expect(point.sessionAge).toBeGreaterThanOrEqual(0);
    });

    it('does nothing when isActive is false', () => {
      tracker.isActive = false;
      record('op');
      expect(tracker.performanceHistory).toHaveLength(0);
    });

    it('caps history at 1000 entries, shifting out the oldest', () => {
      for (let i = 0; i < 1005; i++) {
        tracker.recordPerformance('op', { duration: i });
      }
      expect(tracker.performanceHistory).toHaveLength(1000);
      expect(tracker.performanceHistory[0].duration).toBe(5);
      expect(tracker.performanceHistory[999].duration).toBe(1004);
    });
  });

  describe('establishBaseline / updateBaselinesIfNeeded', () => {
    it('does not establish a baseline before 10 samples', () => {
      for (let i = 0; i < 9; i++) record('op');
      expect(tracker.baselines.has('op')).toBe(false);
    });

    it('establishes a baseline once 10 samples exist', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      expect(tracker.baselines.has('op')).toBe(true);
      const baseline = tracker.baselines.get('op');
      expect(baseline.avgDuration).toBe(100);
      expect(baseline.sampleCount).toBe(10);
      expect(baseline.avgCacheHitRate).toBeCloseTo(0.9, 5);
    });

    it('does not auto-update the baseline before baselineWindowMs elapses (default 24h)', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      for (let i = 0; i < 10; i++) record('op', { duration: 200 });
      expect(tracker.baselines.get('op').avgDuration).toBe(100);
    });

    it('auto-updates the baseline once baselineWindowMs has elapsed', () => {
      const t = new PerformanceBaselineTracker({ baselineWindowMs: -1 });
      for (let i = 0; i < 10; i++) t.recordPerformance('op', { duration: 100 });
      const before = t.baselines.get('op').avgDuration;
      expect(before).toBe(100);

      for (let i = 0; i < 10; i++) t.recordPerformance('op', { duration: 200 });
      const after = t.baselines.get('op').avgDuration;

      expect(after).toBeGreaterThan(before);
      expect(after).toBeLessThanOrEqual(200);
      t.destroy();
    });

    it('enforces MAX_BASELINES with LRU eviction of the least recently used entry', () => {
      tracker.MAX_BASELINES = 2;
      for (let i = 0; i < 10; i++) record('a');
      for (let i = 0; i < 10; i++) record('b');
      for (let i = 0; i < 10; i++) record('c');

      expect(tracker.baselines.size).toBe(2);
      expect(tracker.baselines.has('a')).toBe(false);
      expect(tracker.baselines.has('b')).toBe(true);
      expect(tracker.baselines.has('c')).toBe(true);
    });
  });

  describe('updateBaseline', () => {
    it('blends new samples into the existing baseline via exponential moving average', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      for (let i = 0; i < 10; i++) record('op', { duration: 200 });

      tracker.updateBaseline('op');

      // Last 20 samples are 10x100 + 10x200 -> mean 150; EMA: 100*0.9 + 150*0.1 = 105
      expect(tracker.baselines.get('op').avgDuration).toBeCloseTo(105, 5);
    });

    it('does nothing when fewer than 5 recent samples exist for an already-established baseline', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      const avgBefore = tracker.baselines.get('op').avgDuration;

      // Simulate history rotation elsewhere leaving only a few samples of this type.
      tracker.performanceHistory = tracker.performanceHistory.slice(-2);
      tracker.updateBaseline('op');

      expect(tracker.baselines.get('op').avgDuration).toBe(avgBefore);
    });

    it('does nothing when no baseline exists yet for the operation type', () => {
      expect(() => tracker.updateBaseline('never-established')).not.toThrow();
      expect(tracker.baselines.has('never-established')).toBe(false);
    });
  });

  describe('checkImmediateAlerts', () => {
    it('raises a warning alert when duration is between warning and critical thresholds', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 130 }); // 1.3x baseline: >=1.2 warning, <1.5 critical

      const alert = tracker.alerts.find((a) => a.type === 'duration_regression');
      expect(alert.level).toBe('warning');
    });

    it('raises a critical alert when duration exceeds the critical threshold', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 200 }); // 2.0x baseline

      const alert = tracker.alerts.find((a) => a.type === 'duration_regression');
      expect(alert.level).toBe('critical');
      expect(alert.ratio).toBeCloseTo(2.0, 5);
    });

    it('raises no duration alert when duration is within threshold', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 105 });

      expect(tracker.alerts.find((a) => a.type === 'duration_regression')).toBeUndefined();
    });

    it('raises a warning alert when cache hit rate drops below the warning threshold', () => {
      for (let i = 0; i < 10; i++) record('op', { cacheHitRate: 0.9 });
      record('op', { cacheHitRate: 0.7 }); // below 0.9*0.8=0.72, above 0.9*0.6=0.54

      const alert = tracker.alerts.find((a) => a.type === 'cache_degradation');
      expect(alert.level).toBe('warning');
    });

    it('raises a critical alert when cache hit rate drops below the critical threshold', () => {
      for (let i = 0; i < 10; i++) record('op', { cacheHitRate: 0.9 });
      record('op', { cacheHitRate: 0.5 }); // below 0.9*0.6=0.54

      const alert = tracker.alerts.find((a) => a.type === 'cache_degradation');
      expect(alert.level).toBe('critical');
    });

    it('never raises a memory-regression alert (permanently disabled branch)', () => {
      for (let i = 0; i < 10; i++) record('op', { memoryUsed: 1000 });
      record('op', { memoryUsed: 1000000 });

      expect(tracker.alerts.find((a) => a.type === 'memory_regression')).toBeUndefined();
    });

    it('enforces MAX_ALERTS with oldest-first eviction', () => {
      tracker.MAX_ALERTS = 3;
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      // Each of these crosses the critical duration threshold, adding one alert.
      for (let i = 0; i < 5; i++) record('op', { duration: 300 + i });

      expect(tracker.alerts).toHaveLength(3);
    });

    it('does nothing when no baseline exists yet', () => {
      expect(() =>
        tracker.checkImmediateAlerts('never-established', { duration: 999 })
      ).not.toThrow();
      expect(tracker.alerts).toHaveLength(0);
    });
  });

  describe('analyzeTrends', () => {
    it('returns null with fewer than 20 samples', () => {
      for (let i = 0; i < 19; i++) record('op', { duration: 100 });
      expect(tracker.analyzeTrends('op')).toBeNull();
    });

    it('detects a degrading trend for increasing durations', () => {
      for (let i = 0; i < 25; i++) record('trendOp', { duration: 50 + i * 5 });

      const trends = tracker.analyzeTrends('trendOp');
      expect(trends).not.toBeNull();
      expect(trends['5min'].direction).toBe('degrading');
      expect(trends['5min'].slope).toBeGreaterThan(0);
    });

    it('detects an improving trend for decreasing durations', () => {
      for (let i = 0; i < 25; i++) record('trendOp', { duration: 200 - i * 5 });

      const trends = tracker.analyzeTrends('trendOp');
      expect(trends['5min'].direction).toBe('improving');
      expect(trends['5min'].slope).toBeLessThan(0);
    });
  });

  describe('runPeriodicAnalysis', () => {
    it('does nothing when isActive is false', () => {
      for (let i = 0; i < 25; i++) record('trendOp', { duration: 50 + i * 5 });
      tracker.isActive = false;
      tracker.runPeriodicAnalysis();
      expect(tracker.trends.has('trendOp')).toBe(false);
    });

    it('populates the trends cache for each observed operation type', () => {
      for (let i = 0; i < 25; i++) record('trendOp', { duration: 50 + i * 5 });
      tracker.runPeriodicAnalysis();
      expect(tracker.trends.has('trendOp')).toBe(true);
      expect(tracker.trends.get('trendOp').analyzedAt).toEqual(expect.any(Number));
    });

    it('logs a warning when a longer-term trend is degrading beyond the change threshold', () => {
      for (let i = 0; i < 25; i++) record('trendOp', { duration: 50 + i * 20 });
      tracker.runPeriodicAnalysis();
      expect(console.warn).toHaveBeenCalled();
    });

    it('enforces MAX_TRENDS with LRU eviction of the least recently used entry', () => {
      tracker.MAX_TRENDS = 2;
      for (let i = 0; i < 25; i++) record('a', { duration: 50 + i * 5 });
      for (let i = 0; i < 25; i++) record('b', { duration: 50 + i * 5 });
      for (let i = 0; i < 25; i++) record('c', { duration: 50 + i * 5 });

      tracker.runPeriodicAnalysis();

      expect(tracker.trends.size).toBe(2);
      expect(tracker.trends.has('a')).toBe(false);
    });
  });

  describe('getHealthSummary', () => {
    it('reports healthy status with no alerts', () => {
      for (let i = 0; i < 10; i++) record('op');
      const summary = tracker.getHealthSummary();
      expect(summary.status).toBe('healthy');
      expect(summary.totalBaselines).toBe(1);
      expect(summary.totalSamples).toBe(10);
    });

    it('reports warning status when only warning alerts are recent', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 130 });
      expect(tracker.getHealthSummary().status).toBe('warning');
    });

    it('reports critical status when any critical alert is recent', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 200 });
      expect(tracker.getHealthSummary().status).toBe('critical');
    });

    it('excludes alerts older than one hour', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 200 }); // critical alert, timestamp = now

      tracker.alerts[tracker.alerts.length - 1].timestamp = Date.now() - 2 * 60 * 60 * 1000;

      const summary = tracker.getHealthSummary();
      expect(summary.status).toBe('healthy');
      expect(summary.recentAlerts).toBe(0);
    });

    it('includes a baselines array with per-operation summaries', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      const summary = tracker.getHealthSummary();
      expect(summary.baselines).toEqual([
        expect.objectContaining({ operationType: 'op', sampleCount: 10 }),
      ]);
    });
  });

  describe('getOperationHistory', () => {
    it('filters by operationType and applies a limit', () => {
      for (let i = 0; i < 5; i++) record('a', { duration: i });
      for (let i = 0; i < 5; i++) record('b', { duration: i });

      expect(tracker.getOperationHistory('a')).toHaveLength(5);
      expect(tracker.getOperationHistory('a', 2)).toHaveLength(2);
      expect(tracker.getOperationHistory('a', 2)[0].duration).toBe(3);
    });
  });

  describe('_getBaselineLRU / _getTrendLRU', () => {
    it('moves an accessed baseline to the end of Map iteration order', () => {
      for (let i = 0; i < 10; i++) record('a');
      for (let i = 0; i < 10; i++) record('b');
      for (let i = 0; i < 10; i++) record('c');

      tracker._getBaselineLRU('a');
      expect([...tracker.baselines.keys()]).toEqual(['b', 'c', 'a']);
    });

    it('moves an accessed trend to the end of Map iteration order', () => {
      for (let i = 0; i < 25; i++) record('a', { duration: 50 + i * 5 });
      for (let i = 0; i < 25; i++) record('b', { duration: 50 + i * 5 });
      tracker.runPeriodicAnalysis();

      tracker._getTrendLRU('a');
      expect([...tracker.trends.keys()]).toEqual(['b', 'a']);
    });

    it('returns undefined for a missing key without throwing', () => {
      expect(tracker._getBaselineLRU('missing')).toBeUndefined();
      expect(tracker._getTrendLRU('missing')).toBeUndefined();
    });
  });

  describe('statistical helpers', () => {
    it('calculateMean', () => {
      expect(tracker.calculateMean([1, 2, 3, 4])).toBe(2.5);
      expect(tracker.calculateMean([])).toBe(0);
    });

    it('calculateMedian', () => {
      expect(tracker.calculateMedian([1, 2, 3, 4])).toBe(2.5);
      expect(tracker.calculateMedian([1, 2, 3])).toBe(2);
      expect(tracker.calculateMedian([])).toBe(0);
    });

    it('calculateStdDev', () => {
      expect(tracker.calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
      expect(tracker.calculateStdDev([])).toBe(0);
    });

    it('calculateTrendSlope', () => {
      expect(tracker.calculateTrendSlope([{ x: 0, y: 0 }])).toBe(0); // < 2 points
      expect(
        tracker.calculateTrendSlope([
          { x: 0, y: 0 },
          { x: 1, y: 2 },
          { x: 2, y: 4 },
        ])
      ).toBeCloseTo(2, 5);
      // Vertical/degenerate x values would divide by zero -> NaN guarded to 0.
      expect(
        tracker.calculateTrendSlope([
          { x: 0, y: 0 },
          { x: 0, y: 5 },
        ])
      ).toBe(0);
    });
  });

  describe('generateMemoryInvestigationSuggestions', () => {
    it('returns only the generic debug commands below the info threshold', () => {
      expect(tracker.generateMemoryInvestigationSuggestions(1.1)).toHaveLength(3);
    });

    it('adds an info-level suggestion between 1.3 and 1.5', () => {
      const suggestions = tracker.generateMemoryInvestigationSuggestions(1.3);
      expect(suggestions).toHaveLength(5);
      expect(suggestions[0]).toContain('INFO');
    });

    it('adds a warning-level suggestion between 1.5 and 2.0', () => {
      const suggestions = tracker.generateMemoryInvestigationSuggestions(1.5);
      expect(suggestions).toHaveLength(6);
      expect(suggestions[0]).toContain('WARNING');
    });

    it('adds a critical-level suggestion at or above 2.0', () => {
      const suggestions = tracker.generateMemoryInvestigationSuggestions(2.0);
      expect(suggestions).toHaveLength(6);
      expect(suggestions[0]).toContain('CRITICAL');
    });
  });

  describe('logBasicMemoryDebug', () => {
    it('does not throw when called directly', () => {
      for (let i = 0; i < 10; i++) record('op');
      expect(() => tracker.logBasicMemoryDebug('op', { message: 'test alert' })).not.toThrow();
    });
  });

  describe('exportData', () => {
    it('returns history, baselines, alerts, trends, and a health summary', () => {
      for (let i = 0; i < 10; i++) record('op', { duration: 100 });
      record('op', { duration: 200 });

      const exported = tracker.exportData();
      expect(exported.performanceHistory).toHaveLength(11);
      expect(exported.baselines).toHaveProperty('op');
      expect(exported.alerts).toHaveLength(1);
      expect(exported.healthSummary.status).toBe('critical');
    });
  });

  describe('reset', () => {
    it('clears history, baselines, alerts, and trends', () => {
      for (let i = 0; i < 25; i++) record('op', { duration: 50 + i * 5 });
      tracker.runPeriodicAnalysis();
      const startTimeBefore = tracker.monitoringStartTime;

      tracker.reset();

      expect(tracker.performanceHistory).toEqual([]);
      expect(tracker.baselines.size).toBe(0);
      expect(tracker.alerts).toEqual([]);
      expect(tracker.trends.size).toBe(0);
      expect(tracker.monitoringStartTime).toBeGreaterThanOrEqual(startTimeBefore);
    });
  });

  describe('destroy', () => {
    it('stops accepting new performance data and clears the analysis interval', () => {
      tracker.destroy();
      expect(tracker.isActive).toBe(false);
      expect(tracker.analysisIntervalId).toBeNull();

      record('op');
      expect(tracker.performanceHistory).toHaveLength(0);
    });
  });
});

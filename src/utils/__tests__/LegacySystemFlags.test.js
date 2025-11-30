/**
 * Test Suite: Emergency Rollback Infrastructure
 * 
 * Validates the feature flag system and emergency rollback capabilities
 * required for safe Phase 3 legacy system removal.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  LEGACY_REMOVAL_FLAGS,
  ROLLBACK_TRIGGERS,
  initializePerformanceBaselines,
  checkRollbackTriggers,
  executeEmergencyRollback,
  getLegacySystemStatus,
  updatePerformanceBaselines,
  getRollbackStatus,
  resetRollbackMonitoring,
  _rollbackMonitoring
} from '../LegacySystemFlags.js';

describe('Emergency Rollback Infrastructure', () => {
  beforeEach(() => {
    resetRollbackMonitoring();
  });
  
  describe('Feature Flag System', () => {
    test('Default flags should be in safe state (legacy systems enabled)', () => {
      expect(LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.forceParallelProcessing).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore).toBe(false);
      
      // Validation should be enabled by default
      expect(LEGACY_REMOVAL_FLAGS.validateTranslationQuality).toBe(true);
      expect(LEGACY_REMOVAL_FLAGS.enablePerformanceMonitoring).toBe(true);
    });
    
    test('getLegacySystemStatus should reflect current flag state', () => {
      const status = getLegacySystemStatus();
      
      expect(status.useLegacyPatternProcessing).toBe(true); // Not removed yet
      expect(status.useSequentialFallback).toBe(true); // Not removed yet  
      expect(status.useTwoPhasePatterns).toBe(true); // Should use two-phase when not forced off
      expect(status.useParallelProcessing).toBe(true); // Should use parallel when not forced off
    });
    
    test('Emergency restore should override all other flags', () => {
      // Enable some removal flags
      LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = true;
      LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval = true;
      
      // Activate emergency restore
      LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore = true;
      
      const status = getLegacySystemStatus();
      
      // Should restore all legacy systems despite removal flags
      expect(status.useLegacyPatternProcessing).toBe(true);
      expect(status.useSequentialFallback).toBe(true);
      expect(status.useTwoPhasePatterns).toBe(false); // Disabled in emergency mode
      expect(status.useParallelProcessing).toBe(false); // Disabled in emergency mode
      expect(status.reason).toContain('Emergency rollback active');
    });
  });
  
  describe('Performance Monitoring and Baselines', () => {
    test('initializePerformanceBaselines should set up monitoring', () => {
      initializePerformanceBaselines();
      
      const status = getRollbackStatus();
      expect(status.monitoringActive).toBe(true);
      expect(status.performanceBaselines).toBeDefined();
      expect(status.performanceBaselines.baselineTimestamp).toBeDefined();
      expect(status.performanceBaselines.avgMemoryUsage).toBeGreaterThan(0);
    });
    
    test('updatePerformanceBaselines should maintain moving averages', () => {
      initializePerformanceBaselines();
      
      // First update (should set initial values)
      updatePerformanceBaselines({
        processingTime: 100,
        cacheHitRate: 85,
        parallelEfficiency: 2.0,
        qualityScore: 95,
        memoryUsage: 1000000
      });
      
      const status1 = getRollbackStatus();
      expect(status1.performanceBaselines.avgProcessingTime).toBe(100);
      expect(status1.performanceBaselines.avgCacheHitRate).toBe(85);
      
      // Second update (should use moving average)
      updatePerformanceBaselines({
        processingTime: 200,
        cacheHitRate: 90,
        parallelEfficiency: 1.5,
        qualityScore: 90,
        memoryUsage: 1200000
      });
      
      const status2 = getRollbackStatus();
      expect(status2.performanceBaselines.avgProcessingTime).toBe(110); // 100 * 0.9 + 200 * 0.1
      expect(status2.performanceBaselines.avgCacheHitRate).toBe(85.5); // 85 * 0.9 + 90 * 0.1
    });
  });
  
  describe('Rollback Trigger Detection', () => {
    beforeEach(() => {
      initializePerformanceBaselines();
      
      // Set initial baselines
      updatePerformanceBaselines({
        processingTime: 100,
        cacheHitRate: 90,
        parallelEfficiency: 2.0,
        qualityScore: 95,
        memoryUsage: 1000000
      });
    });
    
    test('Should detect quality regression triggers', () => {
      const result = checkRollbackTriggers({
        qualityScore: 85, // 95 -> 85 is 10.5% regression (>5% limit)
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]).toContain('Quality regression');
      expect(result.triggers[0]).toContain('10.5%');
    });
    
    test('Should detect performance regression triggers', () => {
      const result = checkRollbackTriggers({
        processingTime: 250, // 100 -> 250 is 2.5x regression (>2x limit)
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]).toContain('Performance regression');
      expect(result.triggers[0]).toContain('2.50x');
    });
    
    test('Should detect cache performance triggers', () => {
      const result = checkRollbackTriggers({
        cacheHitRate: 75, // Below 85% minimum
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]).toContain('Cache hit rate: 75%');
    });
    
    test('Should detect parallel efficiency triggers', () => {
      const result = checkRollbackTriggers({
        parallelEfficiency: 1.5, // Below 1.8 minimum
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]).toContain('Parallel efficiency: 1.50');
    });
    
    test('Should detect memory regression triggers', () => {
      const result = checkRollbackTriggers({
        memoryUsage: 1600000, // 1000000 -> 1600000 is 60% increase (>50% limit)
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]).toContain('Memory regression: 60.0%');
    });
    
    test('Should detect consecutive failure triggers', () => {
      // First two failures should not trigger rollback
      let result = checkRollbackTriggers({ success: false });
      expect(result.rollbackRecommended).toBe(false);
      expect(result.consecutiveFailures).toBe(1);
      
      result = checkRollbackTriggers({ success: false });
      expect(result.rollbackRecommended).toBe(false);
      expect(result.consecutiveFailures).toBe(2);
      
      // Third consecutive failure should trigger rollback
      result = checkRollbackTriggers({ success: false });
      expect(result.rollbackRecommended).toBe(true);
      expect(result.consecutiveFailures).toBe(3);
      expect(result.triggers[0]).toContain('Consecutive failures: 3');
      
      // Success should reset counter
      result = checkRollbackTriggers({ success: true });
      expect(result.consecutiveFailures).toBe(0);
    });
    
    test('Should handle multiple simultaneous triggers', () => {
      const result = checkRollbackTriggers({
        processingTime: 300, // 3x regression
        cacheHitRate: 70, // Below minimum
        parallelEfficiency: 1.2, // Below minimum
        qualityScore: 85, // >5% regression
        memoryUsage: 1700000, // 70% increase
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(true);
      expect(result.triggers).toHaveLength(5); // All triggers should fire
    });
    
    test('Should not trigger rollback for good performance', () => {
      const result = checkRollbackTriggers({
        processingTime: 90, // Better than baseline
        cacheHitRate: 95, // Above minimum
        parallelEfficiency: 2.5, // Above minimum
        qualityScore: 97, // Better than baseline
        memoryUsage: 950000, // Lower than baseline
        success: true
      });
      
      expect(result.rollbackRecommended).toBe(false);
      expect(result.triggers).toHaveLength(0);
    });
  });
  
  describe('Emergency Rollback Execution', () => {
    test('executeEmergencyRollback should restore all legacy systems', () => {
      // Enable some removal flags first
      LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = true;
      LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval = true;
      LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns = true;
      
      const triggers = ['Test trigger 1', 'Test trigger 2'];
      const result = executeEmergencyRollback(triggers);
      
      expect(result.success).toBe(true);
      expect(result.triggers).toEqual(triggers);
      expect(result.message).toContain('All legacy systems restored successfully');
      
      // Verify flags were reset
      expect(LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.forceTwoPhasePatterns).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore).toBe(true);
      
      // Verify rollback was recorded
      const status = getRollbackStatus();
      expect(status.rollbackHistory).toHaveLength(1);
      expect(status.rollbackHistory[0].triggers).toEqual(triggers);
      expect(status.consecutiveFailures).toBe(0); // Should reset failure count
    });
    
    test('executeEmergencyRollback should provide actionable recommendations', () => {
      const result = executeEmergencyRollback(['Quality regression: 10%']);
      
      expect(result.recommendedActions).toContain('Monitor system stability for 10-15 minutes');
      expect(result.recommendedActions).toContain('Re-run Phase 3A validation framework before retry');
      expect(result.recommendedActions).toContain('Consider gradual rollout instead of immediate removal');
    });
  });
  
  describe('Integration with Translation Engine', () => {
    test('Legacy system status should guide translation engine behavior', () => {
      // Test default state (legacy systems available)
      let status = getLegacySystemStatus();
      expect(status.useLegacyPatternProcessing).toBe(true);
      expect(status.useSequentialFallback).toBe(true);
      
      // Test removal state  
      LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = true;
      LEGACY_REMOVAL_FLAGS.enableSequentialFallbackRemoval = true;
      
      status = getLegacySystemStatus();
      expect(status.useLegacyPatternProcessing).toBe(false);
      expect(status.useSequentialFallback).toBe(false);
      
      // Test emergency override
      LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore = true;
      
      status = getLegacySystemStatus();
      expect(status.useLegacyPatternProcessing).toBe(true);
      expect(status.useSequentialFallback).toBe(true);
    });
  });
  
  describe('Monitoring State Management', () => {
    test('getRollbackStatus should provide comprehensive monitoring info', () => {
      initializePerformanceBaselines();
      updatePerformanceBaselines({ processingTime: 100, cacheHitRate: 85 });
      executeEmergencyRollback(['Test rollback']);
      
      const status = getRollbackStatus();
      
      expect(status.monitoringActive).toBe(true);
      expect(status.performanceBaselines.avgProcessingTime).toBe(100);
      expect(status.rollbackHistory).toHaveLength(1);
      expect(status.currentFlags).toEqual(LEGACY_REMOVAL_FLAGS);
      expect(status.rollbackTriggers).toEqual(ROLLBACK_TRIGGERS);
    });
    
    test('resetRollbackMonitoring should restore safe defaults', () => {
      // Set up some state first
      initializePerformanceBaselines();
      executeEmergencyRollback(['Test']);
      LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval = true;
      
      // Reset should restore everything to safe defaults
      resetRollbackMonitoring();
      
      const status = getRollbackStatus();
      expect(status.monitoringActive).toBe(false);
      expect(status.rollbackHistory).toHaveLength(0);
      expect(status.consecutiveFailures).toBe(0);
      
      expect(LEGACY_REMOVAL_FLAGS.enableLegacyPatternRemoval).toBe(false);
      expect(LEGACY_REMOVAL_FLAGS.emergencyLegacyRestore).toBe(false);
    });
  });
  
  describe('Rollback Trigger Thresholds', () => {
    test('ROLLBACK_TRIGGERS should match CLAUDE.md specifications', () => {
      expect(ROLLBACK_TRIGGERS.maxQualityRegressionPercent).toBe(5);
      expect(ROLLBACK_TRIGGERS.minParallelSuccessRate).toBe(95);
      expect(ROLLBACK_TRIGGERS.minTranslationCompleteness).toBe(100);
      expect(ROLLBACK_TRIGGERS.maxPerformanceRegressionFactor).toBe(2.0);
      expect(ROLLBACK_TRIGGERS.minCacheHitRate).toBe(85);
      expect(ROLLBACK_TRIGGERS.minParallelEfficiency).toBe(1.8);
      expect(ROLLBACK_TRIGGERS.maxConsecutiveFailures).toBe(3);
    });
    
    test('Triggers should be conservative enough for production safety', () => {
      // Quality regression: 5% allows for minor variations while catching real issues
      expect(ROLLBACK_TRIGGERS.maxQualityRegressionPercent).toBeLessThanOrEqual(10);
      
      // Performance regression: 2x allows for reasonable overhead while preventing major slowdowns
      expect(ROLLBACK_TRIGGERS.maxPerformanceRegressionFactor).toBeLessThanOrEqual(3);
      
      // Consecutive failures: 3 allows for transient issues while preventing sustained problems
      expect(ROLLBACK_TRIGGERS.maxConsecutiveFailures).toBeLessThanOrEqual(5);
    });
  });
});
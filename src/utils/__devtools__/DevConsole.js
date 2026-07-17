import { systemPerformanceMonitor } from '../performance/SystemPerformanceMonitor';
import { logger } from '../logger';

export function installDevConsole(engine) {
  window.translationEngine = engine;
  window.runPatternParityTests = async () => {
    const processor = engine?.twoPhasePatternProcessor;
    if (!processor) {
      logger.error('❌ TwoPhasePatternProcessor not available');
      return;
    }
    const { runAllParityTests } = await import('../__benchmarks__/PatternParityTest.js');
    return await runAllParityTests(processor);
  };

  window.performanceDashboard = {
    getHealthReport: () => systemPerformanceMonitor.getSystemHealthReport(),
    getBaselines: () => systemPerformanceMonitor.baselineTracker.baselines,
    getAlerts: () => systemPerformanceMonitor.baselineTracker.alerts,
    getTrends: () => systemPerformanceMonitor.baselineTracker.trends,
    exportData: () => systemPerformanceMonitor.baselineTracker.exportData(),
    resetData: () => systemPerformanceMonitor.baselineTracker.reset(),
    // getWasmSyncMetrics: see ADR-020 for restoration shape (DictionaryWasmLookup.getSyncMetrics)
    investigateMemoryAlerts: () => {
      const alerts = systemPerformanceMonitor.baselineTracker.alerts;
      const memoryAlerts = alerts.filter(
        (a) => a.type === 'memory_regression' && Date.now() - a.timestamp < 3600000
      ); // Last hour

      if (memoryAlerts.length === 0) {
        logger.log('🟢 No recent memory alerts found');
        return;
      }

      logger.log(`🔍 Found ${memoryAlerts.length} memory alerts in the last hour:`);
      memoryAlerts.forEach((alert, index) => {
        logger.log(`\n${index + 1}. ${alert.level.toUpperCase()}: ${alert.message}`);
        if (alert.investigation) {
          alert.investigation.forEach((suggestion) => logger.log(`   ${suggestion}`));
        }
      });
    },
    checkCachePerformance: () => {
      try {
        const healthReport = systemPerformanceMonitor.getSystemHealthReport();
        const wasmMemoryPool = healthReport.systemMetrics?.integrations?.wasmMemoryPool;

        const wasmMemoryPoolBaseline = healthReport.baselines?.find(
          (b) => b.operationType === 'wasm_memory_pool'
        );

        if (wasmMemoryPool || wasmMemoryPoolBaseline) {
          logger.log('\n🧠 WASM Memory Pool Performance:');

          if (wasmMemoryPool) {
            logger.log(
              `   Recycling Efficiency: ${wasmMemoryPool.recyclingEfficiency?.toFixed(1) || 0}%`
            );
            logger.log(`   Pool Hits: ${wasmMemoryPool.poolHits || 0}`);
            logger.log(`   Pool Misses: ${wasmMemoryPool.poolMisses || 0}`);
            logger.log(
              `   Total Memory Usage: ${((wasmMemoryPool.totalMemoryUsage || 0) / 1024).toFixed(1)}KB`
            );
            logger.log(
              `   Memory Reused: ${((wasmMemoryPool.memoryReused || 0) / 1024).toFixed(1)}KB`
            );
            logger.log(
              `   Avg Allocation Time: ${(wasmMemoryPool.averageAllocationTime || 0).toFixed(2)}ms`
            );
          } else if (wasmMemoryPoolBaseline) {
            logger.log(
              `   Baseline Recycling Efficiency: ${(wasmMemoryPoolBaseline.recyclingEfficiency * 100).toFixed(1)}%`
            );
            logger.log(`   Sample Count: ${wasmMemoryPoolBaseline.sampleCount}`);
            logger.log(
              `   Last Update: ${new Date(wasmMemoryPoolBaseline.lastUpdate).toLocaleTimeString()}`
            );
          }

          const recyclingEfficiency =
            wasmMemoryPool?.recyclingEfficiency ||
            wasmMemoryPoolBaseline?.recyclingEfficiency * 100 ||
            0;
          if (recyclingEfficiency < 70) {
            logger.log('\n💡 WASM Memory Pool Suggestions:');
            logger.log('   - Increase pool sizes for better recycling');
            logger.log('   - Check if memory pressure is forcing frequent cleanup');
            logger.log('   - Consider optimizing allocation patterns');
          } else if (recyclingEfficiency > 0) {
            logger.log('\n✅ WASM memory pool performing efficiently!');
          }

          if (wasmMemoryPool?.recommendations?.length > 0) {
            logger.log('\n📋 WASM Memory Pool Recommendations:');
            wasmMemoryPool.recommendations.forEach((rec, i) => {
              logger.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
            });
          }
        }

        if (!wasmMemoryPool) {
          logger.log('⚠️ Cache and memory pool metrics not available');
        }
      } catch (error) {
        logger.error('Error checking cache performance:', error);
      }
    },
    help: () =>
      logger.log(`
📊 Performance Dashboard Commands:
- performanceDashboard.getHealthReport() - Current system health
- performanceDashboard.getBaselines() - Performance baselines
- performanceDashboard.getAlerts() - Recent performance alerts
- performanceDashboard.investigateMemoryAlerts() - Show memory investigation suggestions
- performanceDashboard.checkCachePerformance() - Analyze cache performance
- performanceDashboard.getTrends() - Performance trend analysis
- performanceDashboard.exportData() - Export all monitoring data
- performanceDashboard.resetData() - Reset all monitoring data
      `),
  };

  logger.log(
    '🛠️ Development console installed: window.translationEngine, window.performanceDashboard'
  );

  window.systemPerformanceMonitor = systemPerformanceMonitor;

  window.checkRealMemory = () => {
    if (performance.memory) {
      const memory = performance.memory;
      logger.log('🧠 Real JavaScript Memory Usage:');
      logger.log(`   Used: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
      logger.log(`   Total: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
      logger.log(`   Limit: ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
      logger.log(
        `   Usage: ${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)}%`
      );
      return memory;
    } else {
      logger.log('⚠️ performance.memory not available');
      return null;
    }
  };

  import('../__benchmarks__/OptimizationBenchmarks.js').then(({ optimizationBenchmarks }) => {
    window.optimizationBenchmarks = optimizationBenchmarks;
    window.runOptimizationBenchmarks = () => optimizationBenchmarks.runFullSuite();
    logger.log('🚀 Optimization benchmarks available:');
    logger.log('   - window.runOptimizationBenchmarks() - Run full benchmark suite');
    logger.log('   - window.optimizationBenchmarks.exportResults() - Export benchmark data');
    logger.log('   - window.optimizationBenchmarks.compareToBaseline() - Compare to baseline');
  });
}

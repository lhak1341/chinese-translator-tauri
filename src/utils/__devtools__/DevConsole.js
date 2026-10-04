import { globalPerformanceMonitor } from '../performance/PerformanceMonitor';
import { logger } from '../logger';

export function installDevConsole(engine) {
  window.translationEngine = engine;

  window.performanceDashboard = {
    getStats: () => globalPerformanceMonitor.getMetrics(),
    help: () =>
      logger.log(`
📊 Performance Dashboard Commands:
- performanceDashboard.getStats() - Translation timing: avgTime, totalOperations, opsPerSecond, min/max
      `),
  };

  logger.log(
    '🛠️ Development console installed: window.translationEngine, window.performanceDashboard'
  );

  import('../__benchmarks__/OptimizationBenchmarks.js').then(({ optimizationBenchmarks }) => {
    window.optimizationBenchmarks = optimizationBenchmarks;
    window.runOptimizationBenchmarks = () => optimizationBenchmarks.runFullSuite();
    logger.log('🚀 Optimization benchmarks available:');
    logger.log('   - window.runOptimizationBenchmarks() - Run full benchmark suite');
    logger.log('   - window.optimizationBenchmarks.exportResults() - Export benchmark data');
    logger.log('   - window.optimizationBenchmarks.compareToBaseline() - Compare to baseline');
  });
}

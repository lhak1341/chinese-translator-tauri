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
}

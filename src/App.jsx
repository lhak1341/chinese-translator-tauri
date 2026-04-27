import { useEffect, useRef } from 'react';
import TabbedInterface from './components/TabbedInterface';
import { DictionaryProvider } from './components/dictionary/DictionaryContext';
import { ToastProvider, useToast, setGlobalToast } from './components/ToastContext';
import { systemPerformanceMonitor } from './utils/performance/ProactivePerformanceDetector.js';
import { logger } from './utils/logger';
import { optimizationBenchmarks } from './utils/performance/OptimizationBenchmarks.js';
// NOTE: WASM singleton cleanup intentionally NOT called from App unmount.
// Module-level WASM singletons (WasmNumberProcessor, WasmPatternProcessor,
// rustLookupIndexManager, wasmMemoryPoolManager, contentAwarePositionCache)
// live for the app lifetime. Calling their cleanup() on App unmount races
// with module-load IIFE auto-init under React 18 StrictMode dev double-mount,
// and provides no benefit (App is the root component and never unmounts in
// production). Use the `reinitializeWasm*` paths for legitimate reset flows.

function App() {
  // Mounted-ref guards async work (loadAppearanceSettings) from applying
  // CSS variable changes after unmount during StrictMode dev double-mount.
  const isMountedRef = useRef(true);

  // Load and apply appearance settings on app start
  useEffect(() => {
    isMountedRef.current = true;

    const loadAppearanceSettings = async () => {
      try {
        const result = await window.electronAPI.loadAppearanceSettings();
        if (!isMountedRef.current) return;
        if (result.success && result.data) {
          const appearance = result.data;

          // Apply appearance settings to CSS custom properties
          const root = document.documentElement;
          root.style.setProperty('--chinese-text-font', appearance.chineseText.fontFamily);
          root.style.setProperty('--chinese-text-size', appearance.chineseText.fontSize);
          root.style.setProperty('--full-translation-font', appearance.fullTranslation.fontFamily);
          root.style.setProperty('--full-translation-size', appearance.fullTranslation.fontSize);
          root.style.setProperty('--character-only-font', appearance.characterOnly.fontFamily);
          root.style.setProperty('--character-only-size', appearance.characterOnly.fontSize);
          if (appearance.uiFont?.fontFamily) {
            root.style.setProperty('--ui-font', appearance.uiFont.fontFamily);
          }
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        logger.error('Failed to load appearance settings:', error);
      }
    };

    const initializePerformanceMonitoring = () => {
      // Start system-wide performance regression detection
      systemPerformanceMonitor.startMonitoring(30000); // 30-second intervals

      // Log initial health status
      const healthReport = systemPerformanceMonitor.getSystemHealthReport();
      logger.log('📊 Performance monitoring initialized:', {
        status: healthReport.status,
        integrations: systemPerformanceMonitor.integrations.size,
        memoryPressure: (healthReport.systemMetrics.memory.pressure * 100).toFixed(1) + '%',
      });

      // Expose performance dashboard to console for debugging (development only)
      if (process.env.NODE_ENV === 'development') {
        window.performanceDashboard = {
          getHealthReport: () => systemPerformanceMonitor.getSystemHealthReport(),
          getBaselines: () => systemPerformanceMonitor.baselineTracker.baselines,
          getAlerts: () => systemPerformanceMonitor.baselineTracker.alerts,
          getTrends: () => systemPerformanceMonitor.baselineTracker.trends,
          exportData: () => systemPerformanceMonitor.baselineTracker.exportData(),
          resetData: () => systemPerformanceMonitor.baselineTracker.reset(),
          getWasmSyncMetrics: () => {
            // ARCHITECTURAL FIX: Expose WASM sync failure tracking
            try {
              if (!window.translationEngine?.dictionaryManager?.wasmManager) {
                logger.log('⚠️ WASM Dictionary Manager not available');
                return null;
              }

              const metrics =
                window.translationEngine.dictionaryManager.wasmManager.getSyncMetrics();

              logger.log('🦀 WASM Dictionary Sync Metrics:');
              logger.log(`   Status: ${metrics.currentStatus}`);
              logger.log(
                `   Overall Success Rate: ${metrics.successRate}% (${metrics.successfulSyncs}/${metrics.totalAttempts} operations)`
              );
              logger.log(`   Failed Syncs: ${metrics.failedSyncs}`);
              logger.log(`   Consecutive Failures: ${metrics.consecutiveFailures}`);

              // Show batch vs sequential breakdown
              logger.log('\n   📦 Batch Loading:');
              logger.log(`      Attempts: ${metrics.batch.attempts}`);
              logger.log(`      Successes: ${metrics.batch.successes}`);
              logger.log(
                `      Success Rate: ${metrics.batch.successRate}${metrics.batch.successRate !== 'N/A' ? '%' : ''}`
              );

              logger.log('\n   📝 Sequential Loading:');
              logger.log(`      Attempts: ${metrics.sequential.attempts}`);
              logger.log(`      Successes: ${metrics.sequential.successes}`);
              logger.log(
                `      Success Rate: ${metrics.sequential.successRate}${metrics.sequential.successRate !== 'N/A' ? '%' : ''}`
              );

              if (metrics.lastSyncAttempt) {
                logger.log(
                  `\n   Last Sync Attempt: ${new Date(metrics.lastSyncAttempt).toLocaleString()}`
                );
              }

              if (metrics.lastSyncSuccess) {
                logger.log(
                  `   Last Success: ${new Date(metrics.lastSyncSuccess).toLocaleString()}`
                );
              }

              if (metrics.lastSyncFailure) {
                logger.log(
                  `   Last Failure: ${new Date(metrics.lastSyncFailure).toLocaleString()}`
                );
              }

              if (metrics.recentFailures && metrics.recentFailures.length > 0) {
                logger.log('\n   Recent Failures:');
                metrics.recentFailures.forEach((failure, index) => {
                  const methodLabel =
                    failure.method === 'batch'
                      ? '📦'
                      : failure.method === 'sequential'
                        ? '📝'
                        : '❓';
                  logger.log(
                    `   ${index + 1}. ${methodLabel} ${new Date(failure.timestamp).toLocaleTimeString()} - ${failure.reason}`
                  );
                });
              }

              if (metrics.currentStatus === 'FALLBACK_MODE') {
                logger.log(
                  '\n⚠️ WARNING: WASM in fallback mode. Dictionary operations using slower JavaScript implementation.'
                );
              }

              // Provide helpful context
              if (
                metrics.batch.successRate === '0.0' &&
                metrics.sequential.successRate === '100.0'
              ) {
                logger.log(
                  '\n💡 INFO: Batch loading failed but sequential fallback succeeded. All dictionaries loaded successfully.'
                );
              }

              return metrics;
            } catch (error) {
              logger.error('Error getting WASM sync metrics:', error);
              return null;
            }
          },
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
              const positionCache = healthReport.systemMetrics?.integrations?.positionCache;
              const semanticCache =
                healthReport.systemMetrics?.integrations?.semanticTranslationCache;
              const wasmMemoryPool = healthReport.systemMetrics?.integrations?.wasmMemoryPool;

              // Also check baselines for cache data
              const positionCacheBaseline = healthReport.baselines?.find(
                (b) => b.operationType === 'position_cache'
              );
              const semanticCacheBaseline = healthReport.baselines?.find(
                (b) => b.operationType === 'semantic_translation_cache'
              );
              const wasmMemoryPoolBaseline = healthReport.baselines?.find(
                (b) => b.operationType === 'wasm_memory_pool'
              );

              if (positionCache) {
                logger.log('📊 Position Cache Performance:');
                logger.log(`   Hit Rate: ${positionCache.hitRate}%`);
                logger.log(`   Total Hits: ${positionCache.totalHits || 0}`);
                logger.log(`   Estimated Time Saved: ${positionCache.estimatedTimeSaved || 0}ms`);

                if (positionCache.hitRate < 70) {
                  logger.log('\n💡 Position Cache Suggestions:');
                  logger.log('   - Lower similarity threshold from 85% to 80%');
                  logger.log('   - Increase cache size from 500 to 750 entries');
                  logger.log('   - Check if content varies significantly between translations');
                }
              }

              // Show semantic cache from either direct metrics or baseline data
              if (semanticCache || semanticCacheBaseline) {
                logger.log('\n🔍 Semantic Translation Cache Performance:');

                if (semanticCache) {
                  logger.log(`   Hit Rate: ${semanticCache.hitRate}%`);
                  logger.log(`   Exact Hits: ${semanticCache.exactHits || 0}`);
                  logger.log(`   Semantic Hits: ${semanticCache.semanticHits || 0}`);
                  logger.log(`   Cache Size: ${semanticCache.cacheSize || 0} entries`);
                  logger.log(`   Estimated Time Saved: ${semanticCache.estimatedTimeSaved || 0}ms`);
                } else if (semanticCacheBaseline) {
                  logger.log(
                    `   Baseline Hit Rate: ${(semanticCacheBaseline.avgCacheHitRate * 100).toFixed(1)}%`
                  );
                  logger.log(`   Sample Count: ${semanticCacheBaseline.sampleCount}`);
                  logger.log(
                    `   Last Update: ${new Date(semanticCacheBaseline.lastUpdate).toLocaleTimeString()}`
                  );
                }

                const hitRate =
                  semanticCache?.hitRate || semanticCacheBaseline?.avgCacheHitRate * 100 || 0;
                if (hitRate < 60) {
                  logger.log('\n💡 Semantic Cache Suggestions:');
                  logger.log('   - Lower similarity threshold from 80% to 75%');
                  logger.log('   - Increase cache size from 1000 to 1500 entries');
                  logger.log('   - Check semantic matching effectiveness in debug logs');
                } else if (hitRate > 0) {
                  logger.log('\n✅ Semantic cache performing well!');
                }
              }

              // Show WASM memory pool metrics
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

                // Show recommendations if available
                if (wasmMemoryPool?.recommendations?.length > 0) {
                  logger.log('\n📋 WASM Memory Pool Recommendations:');
                  wasmMemoryPool.recommendations.forEach((rec, i) => {
                    logger.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
                  });
                }
              }

              if (!positionCache && !semanticCache && !wasmMemoryPool) {
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
- performanceDashboard.checkCachePerformance() - Analyze position cache performance
- performanceDashboard.getWasmSyncMetrics() - WASM dictionary sync status and failure tracking
- performanceDashboard.getTrends() - Performance trend analysis
- performanceDashboard.exportData() - Export all monitoring data
- performanceDashboard.resetData() - Reset all monitoring data
          `),
        };

        logger.log('🛠️ Development performance dashboard available: window.performanceDashboard');

        // Also expose system monitor for enhanced debugging
        window.systemPerformanceMonitor = systemPerformanceMonitor;

        // Add simple memory checker for debugging false alerts
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

        // Expose optimization benchmarks for TypeScript/Rust optimization tracking
        window.optimizationBenchmarks = optimizationBenchmarks;
        window.runOptimizationBenchmarks = () => optimizationBenchmarks.runFullSuite();

        logger.log('🚀 Optimization benchmarks available:');
        logger.log('   - window.runOptimizationBenchmarks() - Run full benchmark suite');
        logger.log('   - window.optimizationBenchmarks.exportResults() - Export benchmark data');
        logger.log('   - window.optimizationBenchmarks.compareToBaseline() - Compare to baseline');
      }

      // Set up cleanup on unmount.
      // Only stop the performance monitor (it owns a setInterval). Do NOT touch
      // WASM/cache singletons here — they outlive React component lifecycle and
      // calling their .cleanup() races with module-load auto-init under StrictMode.
      return () => {
        systemPerformanceMonitor.destroy();
        logger.log('🔍 Performance monitoring destroyed');
      };
    };

    loadAppearanceSettings();

    const cleanup = initializePerformanceMonitoring();

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  return (
    <ToastProvider>
      <DictionaryProvider>
        <AppContent />
      </DictionaryProvider>
    </ToastProvider>
  );
}

// Inner component to register global toast API
function AppContent() {
  const toast = useToast();

  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <TabbedInterface />
    </div>
  );
}

export default App;

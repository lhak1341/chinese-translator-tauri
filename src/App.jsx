import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import TabbedInterface from './components/TabbedInterface';
import { DictionaryProvider } from './components/dictionary/DictionaryContext';
import { systemPerformanceMonitor } from './utils/ProactivePerformanceDetector.js';

function App() {
  // Load and apply appearance settings on app start
  useEffect(() => {
    const loadAppearanceSettings = async () => {
      try {
        const result = await window.electronAPI.loadAppearanceSettings();
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
        console.error('Failed to load appearance settings:', error);
      }
    };

    const initializePerformanceMonitoring = () => {
      // Start system-wide performance regression detection
      systemPerformanceMonitor.startMonitoring(30000); // 30-second intervals

      // Log initial health status
      const healthReport = systemPerformanceMonitor.getSystemHealthReport();
      console.log('📊 Performance monitoring initialized:', {
        status: healthReport.status,
        integrations: systemPerformanceMonitor.integrations.size,
        memoryPressure: (healthReport.systemMetrics.memory.pressure * 100).toFixed(1) + '%'
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
          investigateMemoryAlerts: () => {
            const alerts = systemPerformanceMonitor.baselineTracker.alerts;
            const memoryAlerts = alerts.filter(a => a.type === 'memory_regression' && Date.now() - a.timestamp < 3600000); // Last hour

            if (memoryAlerts.length === 0) {
              console.log('🟢 No recent memory alerts found');
              return;
            }

            console.log(`🔍 Found ${memoryAlerts.length} memory alerts in the last hour:`);
            memoryAlerts.forEach((alert, index) => {
              console.log(`\n${index + 1}. ${alert.level.toUpperCase()}: ${alert.message}`);
              if (alert.investigation) {
                alert.investigation.forEach(suggestion => console.log(`   ${suggestion}`));
              }
            });
          },
          checkCachePerformance: () => {
            try {
              const healthReport = systemPerformanceMonitor.getSystemHealthReport();
              const positionCache = healthReport.systemMetrics?.integrations?.positionCache;
              const semanticCache = healthReport.systemMetrics?.integrations?.semanticTranslationCache;
              const wasmMemoryPool = healthReport.systemMetrics?.integrations?.wasmMemoryPool;

              // Also check baselines for cache data
              const positionCacheBaseline = healthReport.baselines?.find(b => b.operationType === 'position_cache');
              const semanticCacheBaseline = healthReport.baselines?.find(b => b.operationType === 'semantic_translation_cache');
              const wasmMemoryPoolBaseline = healthReport.baselines?.find(b => b.operationType === 'wasm_memory_pool');

              if (positionCache) {
                console.log('📊 Position Cache Performance:');
                console.log(`   Hit Rate: ${positionCache.hitRate}%`);
                console.log(`   Total Hits: ${positionCache.totalHits || 0}`);
                console.log(`   Estimated Time Saved: ${positionCache.estimatedTimeSaved || 0}ms`);

                if (positionCache.hitRate < 70) {
                  console.log('\n💡 Position Cache Suggestions:');
                  console.log('   - Lower similarity threshold from 85% to 80%');
                  console.log('   - Increase cache size from 500 to 750 entries');
                  console.log('   - Check if content varies significantly between translations');
                }
              }

              // Show semantic cache from either direct metrics or baseline data
              if (semanticCache || semanticCacheBaseline) {
                console.log('\n🔍 Semantic Translation Cache Performance:');

                if (semanticCache) {
                  console.log(`   Hit Rate: ${semanticCache.hitRate}%`);
                  console.log(`   Exact Hits: ${semanticCache.exactHits || 0}`);
                  console.log(`   Semantic Hits: ${semanticCache.semanticHits || 0}`);
                  console.log(`   Cache Size: ${semanticCache.cacheSize || 0} entries`);
                  console.log(`   Estimated Time Saved: ${semanticCache.estimatedTimeSaved || 0}ms`);
                } else if (semanticCacheBaseline) {
                  console.log(`   Baseline Hit Rate: ${(semanticCacheBaseline.avgCacheHitRate * 100).toFixed(1)}%`);
                  console.log(`   Sample Count: ${semanticCacheBaseline.sampleCount}`);
                  console.log(`   Last Update: ${new Date(semanticCacheBaseline.lastUpdate).toLocaleTimeString()}`);
                }

                const hitRate = semanticCache?.hitRate || (semanticCacheBaseline?.avgCacheHitRate * 100) || 0;
                if (hitRate < 60) {
                  console.log('\n💡 Semantic Cache Suggestions:');
                  console.log('   - Lower similarity threshold from 80% to 75%');
                  console.log('   - Increase cache size from 1000 to 1500 entries');
                  console.log('   - Check semantic matching effectiveness in debug logs');
                } else if (hitRate > 0) {
                  console.log('\n✅ Semantic cache performing well!');
                }
              }

              // Show WASM memory pool metrics
              if (wasmMemoryPool || wasmMemoryPoolBaseline) {
                console.log('\n🧠 WASM Memory Pool Performance:');

                if (wasmMemoryPool) {
                  console.log(`   Recycling Efficiency: ${wasmMemoryPool.recyclingEfficiency?.toFixed(1) || 0}%`);
                  console.log(`   Pool Hits: ${wasmMemoryPool.poolHits || 0}`);
                  console.log(`   Pool Misses: ${wasmMemoryPool.poolMisses || 0}`);
                  console.log(`   Total Memory Usage: ${((wasmMemoryPool.totalMemoryUsage || 0) / 1024).toFixed(1)}KB`);
                  console.log(`   Memory Reused: ${((wasmMemoryPool.memoryReused || 0) / 1024).toFixed(1)}KB`);
                  console.log(`   Avg Allocation Time: ${(wasmMemoryPool.averageAllocationTime || 0).toFixed(2)}ms`);
                } else if (wasmMemoryPoolBaseline) {
                  console.log(`   Baseline Recycling Efficiency: ${(wasmMemoryPoolBaseline.recyclingEfficiency * 100).toFixed(1)}%`);
                  console.log(`   Sample Count: ${wasmMemoryPoolBaseline.sampleCount}`);
                  console.log(`   Last Update: ${new Date(wasmMemoryPoolBaseline.lastUpdate).toLocaleTimeString()}`);
                }

                const recyclingEfficiency = wasmMemoryPool?.recyclingEfficiency || (wasmMemoryPoolBaseline?.recyclingEfficiency * 100) || 0;
                if (recyclingEfficiency < 70) {
                  console.log('\n💡 WASM Memory Pool Suggestions:');
                  console.log('   - Increase pool sizes for better recycling');
                  console.log('   - Check if memory pressure is forcing frequent cleanup');
                  console.log('   - Consider optimizing allocation patterns');
                } else if (recyclingEfficiency > 0) {
                  console.log('\n✅ WASM memory pool performing efficiently!');
                }

                // Show recommendations if available
                if (wasmMemoryPool?.recommendations?.length > 0) {
                  console.log('\n📋 WASM Memory Pool Recommendations:');
                  wasmMemoryPool.recommendations.forEach((rec, i) => {
                    console.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
                  });
                }
              }

              if (!positionCache && !semanticCache && !wasmMemoryPool) {
                console.log('⚠️ Cache and memory pool metrics not available');
              }
            } catch (error) {
              console.error('Error checking cache performance:', error);
            }
          },
          help: () => console.log(`
📊 Performance Dashboard Commands:
- performanceDashboard.getHealthReport() - Current system health
- performanceDashboard.getBaselines() - Performance baselines
- performanceDashboard.getAlerts() - Recent performance alerts
- performanceDashboard.investigateMemoryAlerts() - Show memory investigation suggestions
- performanceDashboard.checkCachePerformance() - Analyze position cache performance
- performanceDashboard.getTrends() - Performance trend analysis
- performanceDashboard.exportData() - Export all monitoring data
- performanceDashboard.resetData() - Reset all monitoring data
          `)
        };

        console.log('🛠️ Development performance dashboard available: window.performanceDashboard');

        // Also expose system monitor for enhanced debugging
        window.systemPerformanceMonitor = systemPerformanceMonitor;

        // Add simple memory checker for debugging false alerts
        window.checkRealMemory = () => {
          if (performance.memory) {
            const memory = performance.memory;
            console.log('🧠 Real JavaScript Memory Usage:');
            console.log(`   Used: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
            console.log(`   Total: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
            console.log(`   Limit: ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
            console.log(`   Usage: ${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)}%`);
            return memory;
          } else {
            console.log('⚠️ performance.memory not available');
            return null;
          }
        };
      }

      // Set up cleanup on unmount
      return () => {
        systemPerformanceMonitor.stopMonitoring();
        console.log('🔍 Performance monitoring stopped');
      };
    };

    loadAppearanceSettings();
    const cleanup = initializePerformanceMonitoring();

    return cleanup;
  }, []);

  return (
    <DictionaryProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--background-color)',
            color: 'var(--text-color)',
            border: '1px solid var(--border-color)',
            fontFamily: 'var(--ui-font)',
            fontSize: '0.875rem',
            fontWeight: 500,
          },
          success: {
            iconTheme: {
              primary: 'var(--success-bg)',
              secondary: 'white',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--error-bg)',
              secondary: 'white',
            },
            duration: 5000,
          },
        }}
      />
      <div style={{ height: '100vh', width: '100vw' }}>
        <TabbedInterface />
      </div>
    </DictionaryProvider>
  );
}

export default App;

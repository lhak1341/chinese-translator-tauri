/**
 * Performance monitoring public API.
 *
 * Primary entry points:
 *   - globalPerformanceMonitor  — real-time metrics collection (PerformanceMonitor)
 *   - systemPerformanceMonitor  — baseline tracking + regression alerts (ProactivePerformanceDetector)
 *   - performanceProfiler       — function-level profiling (PerformanceProfiler)
 *   - TranslationProfiler       — translation-specific profiling
 *   - MemoryLeakDetector        — memory accumulation detection
 *   - optimizationBenchmarks    — benchmark suite (dev/debug only)
 */

export { globalPerformanceMonitor, PerformanceMonitor } from './PerformanceMonitor';
export {
  systemPerformanceMonitor,
  PerformanceBaselineTracker,
  SystemPerformanceMonitor,
} from './ProactivePerformanceDetector';
export { performanceProfiler, PerformanceProfiler } from './PerformanceProfiler';
export { TranslationProfiler } from './TranslationProfiler';
export { MemoryLeakDetector } from './MemoryLeakDetector';
export { optimizationBenchmarks, OptimizationBenchmarks } from './OptimizationBenchmarks';

// Internal — used by BatchLogger and PerformanceProfiler
export { getPerformanceMetric, releasePerformanceMetric } from './DebugObjectPool';

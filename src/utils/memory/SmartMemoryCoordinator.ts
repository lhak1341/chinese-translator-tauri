import { logger } from '../logger.js';
import {
  SmartMemoryPressureDetector,
  type CleanupEvent,
  type MemoryPressureOptions,
} from './SmartMemoryPressureDetector.js';
import { BackgroundCleanupManager } from './BackgroundCleanupManager.js';
import { ComponentMemoryProfiler } from './ComponentMemoryProfiler.js';

interface SmartMemoryCoordinatorOptions {
  pressureConfig?: MemoryPressureOptions;
  onEmergency: () => void;
  onHighPriority: () => void;
  onBackground: () => void;
}

/**
 * Owns the smart memory lifecycle: detector construction, pressure dispatch,
 * and shutdown. TranslationEngine provides cleanup callbacks that close over
 * its own state — coordinator decides WHEN, TE decides WHAT to trim.
 *
 * See: docs/adr/ (Candidate 1 from 2026-06-19 architecture review)
 */
export class SmartMemoryCoordinator {
  private _detector: SmartMemoryPressureDetector | null = null;
  private _bgCleanup: BackgroundCleanupManager | null = null;
  private _profiler: ComponentMemoryProfiler | null = null;

  constructor({
    pressureConfig,
    onEmergency,
    onHighPriority,
    onBackground,
  }: SmartMemoryCoordinatorOptions) {
    try {
      this._detector = new SmartMemoryPressureDetector(pressureConfig ?? {});
      this._bgCleanup = new BackgroundCleanupManager();
      this._profiler = new ComponentMemoryProfiler();

      this._detector.onMemoryEvent('cleanup', (event) => {
        const { urgency, pressure, growthRate } = event as CleanupEvent;
        const profileId = this._profiler?.startProfiling(
          'SmartMemoryCoordinator',
          `smart-cleanup-${urgency}`
        );
        try {
          switch (urgency) {
            case 'critical':
              this._bgCleanup?.clear();
              onEmergency();
              logger.warn(
                `🚨 Emergency cleanup triggered: ${(pressure.ratio * 100).toFixed(1)}% memory usage`
              );
              break;
            case 'high':
              this._bgCleanup?.clear();
              onHighPriority();
              logger.log(
                `🧹 High priority cleanup: ${(pressure.ratio * 100).toFixed(1)}% memory usage`
              );
              break;
            case 'medium':
              this._bgCleanup?.queueCleanup(onBackground, 'normal');
              break;
            case 'low':
              this._bgCleanup?.queueCleanup(onBackground, 'low');
              break;
          }
        } catch (/** @type {any} */ error: any) {
          logger.error('❌ Smart cleanup failed:', error.message);
        } finally {
          if (profileId) {
            this._profiler?.completeProfiling(profileId, {
              urgency,
              pressureLevel: pressure.level,
              memoryRatio: pressure.ratio,
              growthRate,
            });
          }
        }
      });

      if (process.env.NODE_ENV === 'development') {
        this._detector.onMemoryEvent('monitoring', (data: any) => {
          if (data.pressure.level === 'high' || data.pressure.level === 'critical') {
            logger.log(
              `🧠 Smart Memory: ${data.pressure.level} pressure (${(data.pressure.ratio * 100).toFixed(1)}%), growth: ${data.growthRate.toFixed(1)}MB/min`
            );
          }
        });
      }

      logger.log('✅ Smart memory management refinements initialized');
    } catch (error: any) {
      logger.warn('⚠️ Failed to initialize smart memory management:', error.message);
      this._detector = null;
      this._bgCleanup = null;
      this._profiler = null;
    }
  }

  startProfiling(name: string, id: string = 'default'): string | null {
    return this._profiler?.startProfiling(name, id) ?? null;
  }

  completeProfiling(id: string | null, metadata: Record<string, unknown> = {}): unknown {
    if (!this._profiler || !id) return null;
    return this._profiler.completeProfiling(id, metadata);
  }

  getStats(): Record<string, unknown> {
    return {
      smartMemoryEnabled: !!this._detector,
      backgroundCleanupEnabled: !!this._bgCleanup,
      memoryProfilingEnabled: !!this._profiler,
      ...(this._detector && { memoryPressure: this._detector.getStats() }),
      ...(this._bgCleanup && { backgroundCleanup: this._bgCleanup.getStats() }),
      ...(this._profiler && {
        memoryProfiling: this._profiler.getProfilerStats(),
        topMemoryConsumers: this._profiler.getTopMemoryConsumers(5),
      }),
    };
  }

  shutdown(): void {
    this._detector?.stop();
    this._detector = null;
    this._bgCleanup?.clear();
    this._bgCleanup = null;
    this._profiler?.setEnabled(false);
    this._profiler = null;
  }
}

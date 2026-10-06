/**
 * Translation Profiler
 *
 * Wall-clock time per translation phase, from the dev console. Reports a table and gives no
 * advice: the numbers include awaits (docs/guides/performance.md), so read them as a hint.
 *
 * Usage:
 *   window.translationEngine.enableProfiling()
 *   // Translate some text
 *   window.translationEngine.getProfilingReport()
 */

import { logger } from '../logger.js';

export class TranslationProfiler {
  constructor() {
    this.enabled = false;
    this.reset();
  }

  reset() {
    this.phases = {
      patterns: { time: 0, calls: 0, name: 'Pattern Matching (WASM)' },
      properNouns: { time: 0, calls: 0, name: 'Proper Noun Dictionary' },
      numbers: { time: 0, calls: 0, name: 'Number Conversion' },
      phrases: { time: 0, calls: 0, name: 'Phrase Dictionary' },
      characters: { time: 0, calls: 0, name: 'Character Dictionary' },
      postProcess: { time: 0, calls: 0, name: 'Post-Processing' },
      total: { time: 0, calls: 0, name: 'Total Translation' },
    };
  }

  enable() {
    this.enabled = true;
    this.reset();
    logger.log('🔬 Translation profiling enabled');
    logger.log('💡 Translate some text, then run: window.translationEngine.getProfilingReport()');
  }

  disable() {
    this.enabled = false;
    logger.log('🔬 Translation profiling disabled');
  }

  /**
   * Profile an async function
   * @param {string} phase - Phase name (patterns, properNouns, etc.)
   * @param {Function} fn - Async function to profile
   * @returns {Promise} Result of the function
   */
  async profile(phase, fn) {
    if (!this.enabled) {
      return await fn();
    }

    const start = performance.now();
    try {
      const result = await fn();
      const elapsed = performance.now() - start;

      if (this.phases[phase]) {
        this.phases[phase].time += elapsed;
        this.phases[phase].calls++;
      }

      return result;
    } catch (error) {
      const elapsed = performance.now() - start;
      if (this.phases[phase]) {
        this.phases[phase].time += elapsed;
        this.phases[phase].calls++;
      }
      throw error;
    }
  }

  /**
   * Profile a synchronous function
   * @param {string} phase - Phase name
   * @param {Function} fn - Synchronous function to profile
   * @returns {*} Result of the function
   */
  profileSync(phase, fn) {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = fn();
      const elapsed = performance.now() - start;

      if (this.phases[phase]) {
        this.phases[phase].time += elapsed;
        this.phases[phase].calls++;
      }

      return result;
    } catch (error) {
      const elapsed = performance.now() - start;
      if (this.phases[phase]) {
        this.phases[phase].time += elapsed;
        this.phases[phase].calls++;
      }
      throw error;
    }
  }

  /**
   * Record time for a phase manually
   * @param {string} phase - Phase name
   * @param {number} timeMs - Time in milliseconds
   */
  recordTime(phase, timeMs) {
    if (!this.enabled || !this.phases[phase]) {
      return;
    }

    this.phases[phase].time += timeMs;
    this.phases[phase].calls++;
  }

  /**
   * Get profiling report
   * @returns {Object} Profiling report with statistics
   */
  getReport() {
    if (!this.enabled) {
      return {
        enabled: false,
        message: 'Profiling not enabled. Run: window.translationEngine.enableProfiling()',
      };
    }

    const totalTime =
      this.phases.total.time || Object.values(this.phases).reduce((sum, p) => sum + p.time, 0);

    const report = Object.entries(this.phases)
      .filter(([_, data]) => data.calls > 0)
      .map(([phase, data]) => ({
        phase: data.name || phase,
        timeMs: data.time.toFixed(2),
        calls: data.calls,
        avgMs: (data.time / data.calls).toFixed(2),
        percentage: ((data.time / totalTime) * 100).toFixed(1) + '%',
        _rawTime: data.time, // For sorting
      }))
      .sort((a, b) => b._rawTime - a._rawTime);

    // Remove raw time from output
    report.forEach((r) => delete r._rawTime);

    return {
      enabled: true,
      totalTimeMs: totalTime.toFixed(2),
      totalCalls: this.phases.total.calls,
      phases: report,
    };
  }

  /**
   * Print formatted report to console
   */
  printReport() {
    const report = this.getReport();

    if (!report.enabled) {
      logger.log(report.message);
      return;
    }

    logger.log('\n' + '='.repeat(80));
    logger.log('📊 TRANSLATION PROFILING REPORT');
    logger.log('='.repeat(80));
    logger.log(`Total Time: ${report.totalTimeMs}ms over ${report.totalCalls} translation(s)\n`);

    logger.log('Phase Breakdown:');
    logger.log('-'.repeat(80));
    logger.table(report.phases);

    logger.log('\n' + '='.repeat(80));
    logger.log('Next Steps:');
    logger.log('- Review phase breakdown above');
    logger.log('- Reset profiling: window.translationEngine.resetProfiling()');
    logger.log('='.repeat(80) + '\n');
  }
}

export default TranslationProfiler;

/**
 * Translation Profiler
 *
 * Performance profiling for translation phases to identify bottlenecks.
 * Used to determine which phases should be migrated to Rust WASM.
 *
 * Usage:
 *   window.translationEngine.enableProfiling()
 *   // Translate some text
 *   window.translationEngine.getProfilingReport()
 */

export class TranslationProfiler {
  constructor() {
    this.enabled = false;
    this.reset();
  }

  reset() {
    this.phases = {
      patterns: { time: 0, calls: 0, name: 'Pattern Matching (WASM)' },
      properNouns: { time: 0, calls: 0, name: 'Proper Noun Dictionary' },
      numbers: { time: 0, calls: 0, name: 'Number Conversion (WASM)' },
      phrases: { time: 0, calls: 0, name: 'Phrase Dictionary' },
      characters: { time: 0, calls: 0, name: 'Character Dictionary' },
      postProcess: { time: 0, calls: 0, name: 'Post-Processing' },
      total: { time: 0, calls: 0, name: 'Total Translation' }
    };
  }

  enable() {
    this.enabled = true;
    this.reset();
    console.log('🔬 Translation profiling enabled');
    console.log('💡 Translate some text, then run: window.translationEngine.getProfilingReport()');
  }

  disable() {
    this.enabled = false;
    console.log('🔬 Translation profiling disabled');
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
        message: 'Profiling not enabled. Run: window.translationEngine.enableProfiling()'
      };
    }

    const totalTime = this.phases.total.time ||
                      Object.values(this.phases).reduce((sum, p) => sum + p.time, 0);

    const report = Object.entries(this.phases)
      .filter(([_, data]) => data.calls > 0)
      .map(([phase, data]) => ({
        phase: data.name || phase,
        timeMs: data.time.toFixed(2),
        calls: data.calls,
        avgMs: (data.time / data.calls).toFixed(2),
        percentage: ((data.time / totalTime) * 100).toFixed(1) + '%',
        _rawTime: data.time // For sorting
      }))
      .sort((a, b) => b._rawTime - a._rawTime);

    // Remove raw time from output
    report.forEach(r => delete r._rawTime);

    return {
      enabled: true,
      totalTimeMs: totalTime.toFixed(2),
      totalCalls: this.phases.total.calls,
      phases: report,
      recommendations: this.getRecommendations(report, totalTime)
    };
  }

  /**
   * Get optimization recommendations based on profiling data
   * @param {Array} phaseReport - Phase profiling data
   * @param {number} totalTime - Total time in ms
   * @returns {Array} Array of recommendation strings
   */
  getRecommendations(phaseReport, totalTime) {
    const recommendations = [];

    // Calculate dictionary phases total
    const dictionaryPhases = phaseReport.filter(p =>
      p.phase.includes('Dictionary') && !p.phase.includes('WASM')
    );
    const dictionaryTime = dictionaryPhases.reduce((sum, p) => sum + parseFloat(p.timeMs), 0);
    const dictionaryPercentage = (dictionaryTime / totalTime) * 100;

    if (dictionaryPercentage > 40) {
      recommendations.push(
        `⚠️  Dictionary phases consume ${dictionaryPercentage.toFixed(1)}% of translation time (${dictionaryTime.toFixed(2)}ms)`
      );
      recommendations.push(
        `✅ RECOMMENDED: Migrate dictionary phases to Rust WASM (estimated 5-15x speedup)`
      );
      recommendations.push(
        `📋 See: DICTIONARY_PHASE_BATCHING_RUST_PLAN.md for migration plan`
      );
    } else if (dictionaryPercentage > 25) {
      recommendations.push(
        `💡 Dictionary phases consume ${dictionaryPercentage.toFixed(1)}% of translation time (${dictionaryTime.toFixed(2)}ms)`
      );
      recommendations.push(
        `⏳ CONSIDER: Dictionary batching could provide moderate speedup (5-10x)`
      );
    } else {
      recommendations.push(
        `✓ Dictionary phases only ${dictionaryPercentage.toFixed(1)}% of time (${dictionaryTime.toFixed(2)}ms) - not the bottleneck`
      );
      recommendations.push(
        `🔍 Focus optimization efforts on higher-percentage phases instead`
      );
    }

    // Check if any single phase is >30%
    const dominantPhases = phaseReport.filter(p =>
      parseFloat(p.percentage) > 30 && p.phase !== 'Total Translation'
    );

    if (dominantPhases.length > 0) {
      dominantPhases.forEach(p => {
        recommendations.push(
          `🎯 ${p.phase} is a bottleneck (${p.percentage} of total time)`
        );
      });
    }

    return recommendations;
  }

  /**
   * Print formatted report to console
   */
  printReport() {
    const report = this.getReport();

    if (!report.enabled) {
      console.log(report.message);
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 TRANSLATION PROFILING REPORT');
    console.log('='.repeat(80));
    console.log(`Total Time: ${report.totalTimeMs}ms over ${report.totalCalls} translation(s)\n`);

    console.log('Phase Breakdown:');
    console.log('-'.repeat(80));
    console.table(report.phases);

    if (report.recommendations.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('💡 RECOMMENDATIONS:');
      console.log('='.repeat(80));
      report.recommendations.forEach(rec => console.log(rec));
    }

    console.log('\n' + '='.repeat(80));
    console.log('Next Steps:');
    console.log('- Review phase breakdown above');
    console.log('- Follow recommendations if dictionary phases >40%');
    console.log('- Reset profiling: window.translationEngine.resetProfiling()');
    console.log('='.repeat(80) + '\n');
  }
}

export default TranslationProfiler;

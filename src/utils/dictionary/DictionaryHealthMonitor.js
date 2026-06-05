import { logger } from '../logger.js';

export class DictionaryHealthMonitor {
  constructor({ getDictionary, getDictionaryNames }) {
    this._getDictionary = getDictionary;
    this._getDictionaryNames = getDictionaryNames;
    /** @type {Map<string, {operationCount: number, lastHealthCheck: any, healthHistory: any[]}>} */
    this._monitors = new Map();
  }

  validateAllDictionaries() {
    const entries = this._collectEntries();
    const result = {
      timestamp: Date.now(),
      totalDictionaries: entries.length,
      validDictionaries: 0,
      invalidDictionaries: 0,
      validationResults: new Map(),
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        totalNodesChecked: 0,
        totalValidationTime: 0,
      },
      healthScores: /** @type {Array<{dictionary: string, score: number, grade: string}>} */ ([]),
      recommendations: /** @type {string[]} */ ([]),
    };

    logger.log(`🔍 Starting dictionary validation for ${entries.length} loaded dictionaries...`);

    for (const [name, trie] of entries) {
      logger.log(`🔍 Validating dictionary: ${name}...`);

      const validation = trie.validateIntegrity();
      const healthScore = trie.getHealthScore();

      result.validationResults.set(name, { validation, healthScore, dictionaryName: name });
      result.summary.totalErrors += validation.errors.length;
      result.summary.totalWarnings += validation.warnings.length;
      result.summary.totalNodesChecked += validation.statistics.nodesChecked;
      result.summary.totalValidationTime += validation.performance.validationTime;
      result.healthScores.push({
        dictionary: name,
        score: healthScore.score,
        grade: healthScore.grade,
      });

      if (validation.isValid) {
        result.validDictionaries++;
        logger.log(`✅ Dictionary "${name}" validation passed (Score: ${healthScore.score}/100)`);
      } else {
        result.invalidDictionaries++;
        logger.log(`❌ Dictionary "${name}" validation failed (Score: ${healthScore.score}/100)`, {
          errors: validation.errors.length,
          warnings: validation.warnings.length,
        });
        result.recommendations.push(
          `Dictionary "${name}" needs attention: ${healthScore.issues.join(', ')}`
        );
      }
    }

    const avgScore =
      result.healthScores.length > 0
        ? result.healthScores.reduce((sum, s) => sum + s.score, 0) / result.healthScores.length
        : 0;

    result.overallHealth = {
      averageScore: avgScore,
      grade:
        avgScore >= 90
          ? 'A'
          : avgScore >= 80
            ? 'B'
            : avgScore >= 70
              ? 'C'
              : avgScore >= 60
                ? 'D'
                : 'F',
      status: result.invalidDictionaries === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION',
    };

    if (result.summary.totalErrors > 0) {
      result.recommendations.unshift(
        'Critical errors detected - run repairAllDictionaries() to fix common issues'
      );
    }
    if (avgScore < 80) {
      result.recommendations.unshift(
        'Overall dictionary health below 80% - consider data validation and cleanup'
      );
    }

    logger.log('📊 Dictionary validation completed:', {
      totalDictionaries: result.totalDictionaries,
      validDictionaries: result.validDictionaries,
      invalidDictionaries: result.invalidDictionaries,
      averageHealthScore: avgScore.toFixed(1),
      totalErrors: result.summary.totalErrors,
      totalWarnings: result.summary.totalWarnings,
      validationTimeMs: result.summary.totalValidationTime.toFixed(1),
    });

    return result;
  }

  repairAllDictionaries() {
    const entries = this._collectEntries();
    const result = {
      timestamp: Date.now(),
      totalDictionaries: entries.length,
      dictionariesRepaired: 0,
      repairResults: new Map(),
      summary: {
        totalRepairsAttempted: 0,
        totalRepairsSuccessful: 0,
        totalRepairsFailed: 0,
      },
    };

    logger.log(`🔧 Starting dictionary repair for ${entries.length} loaded dictionaries...`);

    for (const [name, trie] of entries) {
      logger.log(`🔧 Repairing dictionary: ${name}...`);
      const repairResult = trie.repair();
      result.repairResults.set(name, repairResult);
      result.summary.totalRepairsAttempted += repairResult.repairsAttempted;
      result.summary.totalRepairsSuccessful += repairResult.repairsSuccessful;
      result.summary.totalRepairsFailed += repairResult.repairsFailed;

      if (repairResult.repairsAttempted > 0) {
        result.dictionariesRepaired++;
        logger.log(`🔧 Dictionary "${name}" repairs:`, {
          attempted: repairResult.repairsAttempted,
          successful: repairResult.repairsSuccessful,
          failed: repairResult.repairsFailed,
        });
      } else {
        logger.log(`✅ Dictionary "${name}" needs no repairs`);
      }
    }

    logger.log('📊 Dictionary repair completed:', {
      totalDictionaries: result.totalDictionaries,
      dictionariesRepaired: result.dictionariesRepaired,
      totalRepairsAttempted: result.summary.totalRepairsAttempted,
      totalRepairsSuccessful: result.summary.totalRepairsSuccessful,
      totalRepairsFailed: result.summary.totalRepairsFailed,
    });

    return result;
  }

  getDictionaryHealthReport() {
    const validation = this.validateAllDictionaries();
    const report = {
      timestamp: Date.now(),
      overallHealth: validation.overallHealth,
      dictionaryScores: validation.healthScores,
      criticalIssues: /** @type {any[]} */ ([]),
      recommendations: validation.recommendations,
      statistics: {
        ...validation.summary,
        dictionariesByGrade: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      },
    };

    validation.healthScores.forEach((s) => {
      report.statistics.dictionariesByGrade[s.grade]++;
    });

    for (const [name, r] of validation.validationResults) {
      const criticalErrors = r.validation.errors.filter((e) =>
        ['CIRCULAR_REFERENCE', 'MISSING_ROOT', 'INVALID_NODE_STRUCTURE'].includes(e.type)
      );
      if (criticalErrors.length > 0) {
        report.criticalIssues.push({
          dictionary: name,
          errors: criticalErrors,
          healthScore: r.healthScore.score,
        });
      }
    }

    return report;
  }

  monitorDictionaryHealth(dictionaryName, frequency = 1000) {
    const monitor = this._monitors.get(dictionaryName) || {
      operationCount: 0,
      lastHealthCheck: null,
      healthHistory: [],
    };

    monitor.operationCount++;

    if (monitor.operationCount % frequency === 0) {
      const trie = this._getDictionary(dictionaryName);
      if (trie) {
        const healthScore = trie.getHealthScore();
        monitor.lastHealthCheck = healthScore;
        monitor.healthHistory.push({
          timestamp: Date.now(),
          score: healthScore.score,
          operationCount: monitor.operationCount,
        });

        if (monitor.healthHistory.length > 10) monitor.healthHistory.shift();

        if (healthScore.score < 70) {
          logger.log(
            `⚠️ Dictionary health warning for "${dictionaryName}": ${healthScore.score}/100 (${healthScore.grade})`,
            { issues: healthScore.issues, operationCount: monitor.operationCount }
          );
        }

        this._monitors.set(dictionaryName, monitor);
      }
    }
  }

  _collectEntries() {
    const entries = /** @type {Array<[string, any]>} */ ([]);
    for (const name of this._getDictionaryNames()) {
      const trie = this._getDictionary(name);
      if (trie) entries.push([name, trie]);
    }
    return entries;
  }
}

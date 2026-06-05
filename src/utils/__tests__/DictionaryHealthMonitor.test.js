import { describe, it, expect, vi } from 'vitest';
import { DictionaryHealthMonitor } from '../dictionary/DictionaryHealthMonitor.js';

vi.mock('../logger.js', () => ({ logger: { log: vi.fn() } }));

function makeTrie({
  isValid = true,
  score = 95,
  grade = 'A',
  issues = [],
  errors = [],
  criticalType = null,
} = {}) {
  return {
    validateIntegrity: () => ({
      isValid,
      errors: criticalType ? [{ type: criticalType }] : errors,
      warnings: [],
      statistics: { nodesChecked: 10 },
      performance: { validationTime: 1 },
    }),
    getHealthScore: () => ({ score, grade, issues }),
    repair: () => ({ repairsAttempted: 0, repairsSuccessful: 0, repairsFailed: 0 }),
  };
}

function makeMonitor(trieMap) {
  return new DictionaryHealthMonitor({
    getDictionary: (name) => trieMap.get(name) ?? null,
    getDictionaryNames: () => trieMap.keys(),
  });
}

describe('validateAllDictionaries', () => {
  it('counts valid dictionaries correctly', () => {
    const trieMap = new Map([
      ['phrases', makeTrie()],
      ['characters', makeTrie()],
    ]);
    const monitor = makeMonitor(trieMap);
    const result = monitor.validateAllDictionaries();
    expect(result.totalDictionaries).toBe(2);
    expect(result.validDictionaries).toBe(2);
    expect(result.invalidDictionaries).toBe(0);
    expect(result.overallHealth.status).toBe('HEALTHY');
  });

  it('counts invalid dictionary and adds recommendation', () => {
    const trieMap = new Map([
      ['phrases', makeTrie({ isValid: false, score: 60, grade: 'D', issues: ['orphaned nodes'] })],
    ]);
    const monitor = makeMonitor(trieMap);
    const result = monitor.validateAllDictionaries();
    expect(result.invalidDictionaries).toBe(1);
    expect(result.overallHealth.status).toBe('NEEDS_ATTENTION');
    expect(result.recommendations.some((r) => r.includes('phrases'))).toBe(true);
  });

  it('computes average health grade correctly', () => {
    const trieMap = new Map([
      ['a', makeTrie({ score: 90 })],
      ['b', makeTrie({ score: 70 })],
    ]);
    const result = makeMonitor(trieMap).validateAllDictionaries();
    expect(result.overallHealth.averageScore).toBe(80);
    expect(result.overallHealth.grade).toBe('B');
  });

  it('prepends error recommendation when errors exist', () => {
    const trieMap = new Map([
      [
        'a',
        makeTrie({ isValid: false, score: 50, grade: 'F', errors: [{ type: 'MISSING_ROOT' }] }),
      ],
    ]);
    const result = makeMonitor(trieMap).validateAllDictionaries();
    expect(result.recommendations.some((r) => /Critical errors/.test(r))).toBe(true);
  });
});

describe('repairAllDictionaries', () => {
  it('calls repair on every trie and summarises results', () => {
    const repairSpy = vi.fn(() => ({
      repairsAttempted: 2,
      repairsSuccessful: 2,
      repairsFailed: 0,
    }));
    const trie = { ...makeTrie(), repair: repairSpy };
    const trieMap = new Map([
      ['phrases', trie],
      ['characters', trie],
    ]);
    const result = makeMonitor(trieMap).repairAllDictionaries();
    expect(repairSpy).toHaveBeenCalledTimes(2);
    expect(result.summary.totalRepairsAttempted).toBe(4);
    expect(result.summary.totalRepairsSuccessful).toBe(4);
    expect(result.dictionariesRepaired).toBe(2);
  });
});

describe('getDictionaryHealthReport', () => {
  it('identifies critical issues by error type', () => {
    const trieMap = new Map([
      [
        'phrases',
        makeTrie({ isValid: false, score: 50, grade: 'F', criticalType: 'CIRCULAR_REFERENCE' }),
      ],
      ['characters', makeTrie()],
    ]);
    const report = makeMonitor(trieMap).getDictionaryHealthReport();
    expect(report.criticalIssues).toHaveLength(1);
    expect(report.criticalIssues[0].dictionary).toBe('phrases');
    expect(report.criticalIssues[0].errors[0].type).toBe('CIRCULAR_REFERENCE');
  });

  it('tallies grade distribution', () => {
    const trieMap = new Map([
      ['a', makeTrie({ score: 95, grade: 'A' })],
      ['b', makeTrie({ score: 82, grade: 'B' })],
      ['c', makeTrie({ score: 95, grade: 'A' })],
    ]);
    const report = makeMonitor(trieMap).getDictionaryHealthReport();
    expect(report.statistics.dictionariesByGrade.A).toBe(2);
    expect(report.statistics.dictionariesByGrade.B).toBe(1);
  });
});

describe('monitorDictionaryHealth', () => {
  it('fires health check at frequency=1 (every call)', () => {
    const getHealthScore = vi.fn(() => ({ score: 95, grade: 'A', issues: [] }));
    const trieMap = new Map([['phrases', { ...makeTrie(), getHealthScore }]]);
    const monitor = makeMonitor(trieMap);
    for (let i = 0; i < 3; i++) monitor.monitorDictionaryHealth('phrases', 1);
    expect(getHealthScore).toHaveBeenCalledTimes(3);
  });

  it('records health history (capped at 10 entries)', () => {
    const getHealthScore = vi.fn(() => ({ score: 85, grade: 'B', issues: [] }));
    const trieMap = new Map([['phrases', { ...makeTrie(), getHealthScore }]]);
    const monitor = makeMonitor(trieMap);
    for (let i = 0; i < 15; i++) monitor.monitorDictionaryHealth('phrases', 1);
    expect(getHealthScore).toHaveBeenCalledTimes(15);
    // History is stored on the monitor map entry; last set has 10 entries (capped)
    const stored = monitor._monitors.get('phrases');
    expect(stored.healthHistory).toHaveLength(10);
  });
});

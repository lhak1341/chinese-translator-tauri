import { describe, test, expect } from 'vitest';
import PatternAnalyzer from '../pattern/PatternAnalyzer.js';

const makePattern = (originalPattern, overrides = {}) => ({
  originalPattern,
  template: `template_for_${originalPattern}`,
  ...overrides,
});

describe('PatternAnalyzer — hasVariables / hasXVariable / hasYVariable', () => {
  test('literal pattern has no variables', () => {
    const analyzer = new PatternAnalyzer();
    expect(analyzer.hasVariables('手套')).toBe(false);
    expect(analyzer.hasXVariable('手套')).toBe(false);
    expect(analyzer.hasYVariable('手套')).toBe(false);
  });

  test('X-only pattern', () => {
    const analyzer = new PatternAnalyzer();
    expect(analyzer.hasVariables('X的')).toBe(true);
    expect(analyzer.hasXVariable('X的')).toBe(true);
    expect(analyzer.hasYVariable('X的')).toBe(false);
  });

  test('Y-only pattern', () => {
    const analyzer = new PatternAnalyzer();
    expect(analyzer.hasVariables('Y号')).toBe(true);
    expect(analyzer.hasXVariable('Y号')).toBe(false);
    expect(analyzer.hasYVariable('Y号')).toBe(true);
  });

  test('XY multi-variable pattern', () => {
    const analyzer = new PatternAnalyzer();
    expect(analyzer.hasVariables('X的Y')).toBe(true);
    expect(analyzer.hasXVariable('X的Y')).toBe(true);
    expect(analyzer.hasYVariable('X的Y')).toBe(true);
  });
});

describe('PatternAnalyzer — isMultiVariable', () => {
  test('false for X-only', () => {
    expect(new PatternAnalyzer().isMultiVariable('X的')).toBe(false);
  });

  test('false for Y-only', () => {
    expect(new PatternAnalyzer().isMultiVariable('Y')).toBe(false);
  });

  test('true when both X and Y present', () => {
    expect(new PatternAnalyzer().isMultiVariable('X的Y')).toBe(true);
  });
});

describe('PatternAnalyzer — isCompositeEligible', () => {
  test('X-only pattern is composite eligible', () => {
    expect(new PatternAnalyzer().isCompositeEligible('X的')).toBe(true);
  });

  test('XY multi-variable pattern is NOT composite eligible', () => {
    expect(new PatternAnalyzer().isCompositeEligible('X的Y')).toBe(false);
  });

  test('Y-only pattern is NOT composite eligible', () => {
    expect(new PatternAnalyzer().isCompositeEligible('Y号')).toBe(false);
  });

  test('literal (no variables) is NOT composite eligible', () => {
    expect(new PatternAnalyzer().isCompositeEligible('手套')).toBe(false);
  });
});

describe('PatternAnalyzer — countVariables', () => {
  test('literal has 0 variables', () => {
    expect(new PatternAnalyzer().countVariables('手套')).toBe(0);
  });

  test('single X counts as 1', () => {
    expect(new PatternAnalyzer().countVariables('X的')).toBe(1);
  });

  test('X and Y counts as 2', () => {
    expect(new PatternAnalyzer().countVariables('X的Y')).toBe(2);
  });

  test('multiple X occurrences counted', () => {
    expect(new PatternAnalyzer().countVariables('X和X')).toBe(2);
  });
});

describe('PatternAnalyzer — analyzePattern', () => {
  const analyzer = new PatternAnalyzer();

  test('adds all analysis fields to pattern', () => {
    const result = analyzer.analyzePattern(makePattern('X的Y'));
    expect(result).toMatchObject({
      originalPattern: 'X的Y',
      hasVariables: true,
      hasXVariable: true,
      hasYVariable: true,
      isMultiVariable: true,
      compositeEligible: false,
      variableCount: 2,
    });
  });

  test('X-only pattern has compositeEligible: true', () => {
    const result = analyzer.analyzePattern(makePattern('X的'));
    expect(result.compositeEligible).toBe(true);
    expect(result.isMultiVariable).toBe(false);
  });

  test('preserves original fields', () => {
    const pattern = { ...makePattern('X的'), allowAsPatternVariable: true, lowPriority: false };
    const result = analyzer.analyzePattern(pattern);
    expect(result.allowAsPatternVariable).toBe(true);
    expect(result.lowPriority).toBe(false);
  });

  test('throws when originalPattern is missing', () => {
    expect(() => analyzer.analyzePattern({ template: 'x' })).toThrow('originalPattern');
  });
});

describe('PatternAnalyzer — analyzePatterns (batch)', () => {
  test('maps analyzePattern over all patterns', () => {
    const analyzer = new PatternAnalyzer();
    const patterns = [makePattern('X的'), makePattern('X的Y'), makePattern('手套')];
    const results = analyzer.analyzePatterns(patterns);
    expect(results).toHaveLength(3);
    expect(results[0].hasXVariable).toBe(true);
    expect(results[1].isMultiVariable).toBe(true);
    expect(results[2].hasVariables).toBe(false);
  });

  test('empty array returns empty array', () => {
    expect(new PatternAnalyzer().analyzePatterns([])).toEqual([]);
  });
});

describe('PatternAnalyzer — filterByCapability', () => {
  const analyzer = new PatternAnalyzer();
  const analyzed = analyzer.analyzePatterns([
    makePattern('X的'),
    makePattern('X的Y'),
    makePattern('手套'),
  ]);

  test('filters by compositeEligible', () => {
    const result = analyzer.filterByCapability(analyzed, 'compositeEligible');
    expect(result).toHaveLength(1);
    expect(result[0].originalPattern).toBe('X的');
  });

  test('filters by hasVariables', () => {
    const result = analyzer.filterByCapability(analyzed, 'hasVariables');
    expect(result).toHaveLength(2);
  });
});

describe('PatternAnalyzer — getPhaseAPatterns', () => {
  test('returns only patterns with allowAsPatternVariable: true', () => {
    const analyzer = new PatternAnalyzer();
    const patterns = [
      makePattern('X的', { allowAsPatternVariable: true }),
      makePattern('X的Y', { allowAsPatternVariable: false }),
      makePattern('手套', { allowAsPatternVariable: true }),
    ];
    const analyzed = analyzer.analyzePatterns(patterns);
    const phaseA = analyzer.getPhaseAPatterns(analyzed);
    expect(phaseA).toHaveLength(2);
    expect(phaseA.every((p) => p.allowAsPatternVariable === true)).toBe(true);
  });

  test('returns empty when no patterns have allowAsPatternVariable: true', () => {
    const analyzer = new PatternAnalyzer();
    const analyzed = analyzer.analyzePatterns([makePattern('X的'), makePattern('X的Y')]);
    expect(analyzer.getPhaseAPatterns(analyzed)).toHaveLength(0);
  });
});

describe('PatternAnalyzer — getCompositeEligiblePatterns', () => {
  test('returns only X-only patterns', () => {
    const analyzer = new PatternAnalyzer();
    const patterns = [makePattern('X的'), makePattern('X的Y'), makePattern('手套')];
    const analyzed = analyzer.analyzePatterns(patterns);
    const result = analyzer.getCompositeEligiblePatterns(analyzed);
    expect(result).toHaveLength(1);
    expect(result[0].originalPattern).toBe('X的');
  });
});

describe('PatternAnalyzer — validatePattern', () => {
  const analyzer = new PatternAnalyzer();

  test('valid single-variable pattern with template', () => {
    const result = analyzer.validatePattern(makePattern('X的', { template: 'X của' }));
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('missing originalPattern is invalid', () => {
    const result = analyzer.validatePattern({ template: 'x' });
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/originalPattern/);
  });

  test('pattern with no variables is flagged', () => {
    const result = analyzer.validatePattern(makePattern('手套', { template: 'găng tay' }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('no variables'))).toBe(true);
  });

  test('multi-variable + allowAsPatternVariable is flagged', () => {
    const result = analyzer.validatePattern(
      makePattern('X的Y', { template: 'Y của X', allowAsPatternVariable: true })
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('cannot be used as pattern variables'))).toBe(true);
  });

  test('missing template is flagged', () => {
    const result = analyzer.validatePattern({
      originalPattern: 'X的',
      allowAsPatternVariable: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('template'))).toBe(true);
  });
});

describe('PatternAnalyzer — generateSummary', () => {
  test('returns correct counts for mixed pattern set', () => {
    const analyzer = new PatternAnalyzer();
    const patterns = [
      makePattern('X的', { allowAsPatternVariable: true, template: 'X của' }),
      makePattern('X的Y', { template: 'Y của X' }),
      makePattern('手套', { template: 'găng tay' }),
    ];
    const summary = analyzer.generateSummary(patterns);

    expect(summary.total).toBe(3);
    expect(summary.withVariables).toBe(2); // X的 and X的Y
    expect(summary.multiVariable).toBe(1); // X的Y
    expect(summary.compositeEligible).toBe(1); // X的 only
    expect(summary.phaseAEligible).toBe(1); // X的 (allowAsPatternVariable: true)
    expect(summary.withXOnly).toBe(1); // X的
    expect(typeof summary.validationIssues).toBe('number');
  });

  test('empty pattern set returns all-zero summary', () => {
    const summary = new PatternAnalyzer().generateSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.withVariables).toBe(0);
    expect(summary.multiVariable).toBe(0);
  });
});

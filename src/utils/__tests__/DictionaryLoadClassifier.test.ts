import { describe, it, expect } from 'vitest';
import { classifyLoadResult } from '../dictionary/DictionaryLoadClassifier';

describe('classifyLoadResult', () => {
  // ─── ok ────────────────────────────────────────────────────────────────────

  it('all succeed → ok', () => {
    expect(classifyLoadResult([], 5)).toEqual({ severity: 'ok' });
  });

  it('total=0 (no dicts configured) → ok', () => {
    expect(classifyLoadResult([], 0)).toEqual({ severity: 'ok' });
  });

  // ─── warning ────────────────────────────────────────────────────────────────

  it('partial failure → warning', () => {
    const outcome = classifyLoadResult(['phrases'], 5);
    expect(outcome.severity).toBe('warning');
  });

  it('warning includes failedIds and total', () => {
    const outcome = classifyLoadResult(['phrases', 'patterns'], 5);
    expect(outcome).toMatchObject({
      severity: 'warning',
      failedIds: ['phrases', 'patterns'],
      total: 5,
    });
  });

  it('warning message names count and total', () => {
    const outcome = classifyLoadResult(['phrases'], 5);
    if (outcome.severity !== 'warning') throw new Error('expected warning');
    expect(outcome.message).toContain('1 of 5');
  });

  it('1-of-1 failure is critical, not warning', () => {
    // total=1, successful=0 → critical boundary
    expect(classifyLoadResult(['properNouns'], 1).severity).toBe('critical');
  });

  it('4-of-5 failure is warning (at least one succeeded)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(classifyLoadResult(ids, 5).severity).toBe('warning');
  });

  // ─── critical ───────────────────────────────────────────────────────────────

  it('all fail → critical', () => {
    const outcome = classifyLoadResult(['a', 'b', 'c'], 3);
    expect(outcome.severity).toBe('critical');
  });

  it('critical message mentions total count', () => {
    const outcome = classifyLoadResult(['a', 'b'], 2);
    if (outcome.severity !== 'critical') throw new Error('expected critical');
    expect(outcome.message).toContain('2');
    expect(outcome.message).toContain('Translation unavailable');
  });
});

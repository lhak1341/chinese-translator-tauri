import { describe, expect, test } from 'vitest';
import {
  findBestMatch,
  applyRule,
  findConflict,
  dictionarySupportsTransformRules,
} from '../dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';

function rule(overrides: Partial<TransformRule>): TransformRule {
  return {
    id: 'id',
    matchKind: 'suffix',
    key: '城',
    moveWords: 1,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    ...overrides,
  };
}

// Demo gloss table mirroring the prototype's — only used by these tests.
const GLOSS: Record<string, string> = {
  南: 'nam',
  京: 'kinh',
  城: 'thanh',
  卫: 've',
};
const glossFn = (text: string): string =>
  text
    .split('')
    .map((c) => GLOSS[c] ?? c)
    .join(' ');

describe('findBestMatch', () => {
  test('matches a suffix rule against a Source ending in its key', () => {
    const rules = [rule({ id: 'r1', matchKind: 'suffix', key: '城' })];
    expect(findBestMatch(rules, '南京城')).toEqual(rules[0]);
  });

  test('matches a prefix rule against a Source starting with its key', () => {
    const rules = [rule({ id: 'r1', matchKind: 'prefix', key: '南' })];
    expect(findBestMatch(rules, '南京城')).toEqual(rules[0]);
  });

  test('returns null when nothing matches', () => {
    const rules = [rule({ id: 'r1', matchKind: 'suffix', key: '市' })];
    expect(findBestMatch(rules, '南京城')).toBeNull();
  });

  test('a matching suffix rule always wins over a matching prefix rule', () => {
    const suffixRule = rule({ id: 'suffix', matchKind: 'suffix', key: '城' });
    const prefixRule = rule({ id: 'prefix', matchKind: 'prefix', key: '南' });
    expect(findBestMatch([prefixRule, suffixRule], '南京城')).toEqual(suffixRule);
  });

  test('within one matchKind pool, the longer key wins', () => {
    const shortRule = rule({ id: 'short', matchKind: 'suffix', key: '城' });
    const longRule = rule({ id: 'long', matchKind: 'suffix', key: '卫城' });
    expect(findBestMatch([shortRule, longRule], '南京卫城')).toEqual(longRule);
    // Order in the array must not matter.
    expect(findBestMatch([longRule, shortRule], '南京卫城')).toEqual(longRule);
  });

  test('a disabled rule never matches', () => {
    const rules = [rule({ id: 'r1', matchKind: 'suffix', key: '城', enabled: false })];
    expect(findBestMatch(rules, '南京城')).toBeNull();
  });

  test('charCount constrains to an exact total Source length', () => {
    const rules = [rule({ id: 'r1', matchKind: 'suffix', key: '城', charCount: 3 })];
    expect(findBestMatch(rules, '南京城')).toEqual(rules[0]); // 3 chars — matches
    expect(findBestMatch(rules, '南京大城')).toBeNull(); // 4 chars — charCount excludes it
  });

  test('charCount is not enforced when omitted', () => {
    const rules = [rule({ id: 'r1', matchKind: 'suffix', key: '城' })];
    expect(findBestMatch(rules, '南京大城')).toEqual(rules[0]);
  });
});

describe('applyRule', () => {
  test('suffix rule: capitalize-except-last-N runs before move-last-N-to-front (canonical worked example)', () => {
    const r = rule({ matchKind: 'suffix', key: '城', moveWords: 1, capitalizeExceptN: 1 });
    expect(applyRule(r, '南京城', glossFn)).toBe('thanh Nam Kinh');
  });

  test('prefix rule: capitalize-except-first-N runs before move-first-N-to-end (mirrored)', () => {
    const r = rule({ matchKind: 'prefix', key: '南', moveWords: 1, capitalizeExceptN: 1 });
    // Source "南京城" glosses to "nam kinh thanh"; capitalizeExceptFirstN(_,1) keeps "nam"
    // lowercase and title-cases the rest -> "nam Kinh Thanh"; moveFirstNWordsToEnd(_,1)
    // moves "nam" to the end -> "Kinh Thanh nam".
    expect(applyRule(r, '南京城', glossFn)).toBe('Kinh Thanh nam');
  });

  test('moveWords=0, capitalizeExceptN=0 title-cases every word and does not reorder', () => {
    const r = rule({ matchKind: 'suffix', key: '城', moveWords: 0, capitalizeExceptN: 0 });
    expect(applyRule(r, '南京城', glossFn)).toBe('Nam Kinh Thanh');
  });
});

describe('findConflict', () => {
  test('flags a rule with the same matchKind and key as an existing one', () => {
    const existing = rule({ id: 'existing', matchKind: 'suffix', key: '城' });
    const candidate = { id: 'new', matchKind: 'suffix' as const, key: '城' };
    expect(findConflict([existing], candidate)).toEqual(existing);
  });

  test('does not flag the rule against itself (same id)', () => {
    const existing = rule({ id: 'existing', matchKind: 'suffix', key: '城' });
    const candidate = { id: 'existing', matchKind: 'suffix' as const, key: '城' };
    expect(findConflict([existing], candidate)).toBeUndefined();
  });

  test('the same key is allowed once per matchKind — suffix and prefix do not collide', () => {
    const existing = rule({ id: 'existing', matchKind: 'suffix', key: '城' });
    const candidate = { id: 'new', matchKind: 'prefix' as const, key: '城' };
    expect(findConflict([existing], candidate)).toBeUndefined();
  });

  test('returns undefined when there is no collision', () => {
    const existing = rule({ id: 'existing', matchKind: 'suffix', key: '城' });
    const candidate = { id: 'new', matchKind: 'suffix' as const, key: '市' };
    expect(findConflict([existing], candidate)).toBeUndefined();
  });
});

describe('dictionarySupportsTransformRules', () => {
  test('true for phrases', () => {
    expect(dictionarySupportsTransformRules('phrases')).toBe(true);
  });

  test('true for any properNouns* dictionary', () => {
    expect(dictionarySupportsTransformRules('properNouns')).toBe(true);
    expect(dictionarySupportsTransformRules('properNouns-f_MyNovel')).toBe(true);
  });

  test('false for patterns* dictionaries — literal X/Y placeholder content', () => {
    expect(dictionarySupportsTransformRules('patterns')).toBe(false);
    expect(dictionarySupportsTransformRules('patterns-f_MyNovel')).toBe(false);
  });

  test('false for characters', () => {
    expect(dictionarySupportsTransformRules('characters')).toBe(false);
  });
});

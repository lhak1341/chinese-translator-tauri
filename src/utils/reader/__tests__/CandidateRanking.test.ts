import { describe, expect, it } from 'vitest';
import { candidateType } from '../CandidateAdd';
import { filterByRule, MAX_RANKED, rankCandidates } from '../CandidateRanking';
import { initialEntryGuess } from '../../dictionary/TransformRuleEngine';
import type { Candidate } from '../../../types/ReaderTypes';
import type { TransformRule } from '../../../types/TransformRuleTypes';

const TARGET = 'properNouns-f_Novel';

function rule(overrides: Partial<TransformRule>): TransformRule {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '剑法',
    relocate: false,
    capitalizeExceptN: 0,
    semanticType: 'object',
    enabled: true,
    ...overrides,
  };
}

function candidate(text: string, count: number): Candidate {
  return { text, count, lineCount: count, alsoIn: [] };
}

describe('candidateType', () => {
  it('takes the matching enabled rule, flagged as ruled', () => {
    expect(candidateType([rule({})], '青云剑法', TARGET)).toEqual({
      semanticType: 'object',
      ruled: true,
    });
  });

  it('is the proper-noun default, unruled, when no rule matches or the rule is disabled', () => {
    const unruled = { semanticType: 'character', ruled: false };
    expect(candidateType([rule({})], '滕青山', TARGET)).toEqual(unruled);
    expect(candidateType([rule({ enabled: false })], '青云剑法', TARGET)).toEqual(unruled);
  });

  it('agrees with the type the Add form seeds', () => {
    const rules = [rule({}), rule({ id: 'r2', key: '山', semanticType: 'location' })];
    for (const source of ['青云剑法', '黑风山', '滕青']) {
      expect(candidateType(rules, source, TARGET).semanticType).toBe(
        initialEntryGuess(rules, {}, source, TARGET).semanticType
      );
    }
  });
});

describe('rankCandidates', () => {
  it('ranks a rule-matched candidate above an equal-count one without a match', () => {
    const ranked = rankCandidates(
      [candidate('滕青山', 10), candidate('青云剑法', 10)],
      [rule({})],
      TARGET
    );
    expect(ranked.map((row) => row.candidate.text)).toEqual(['青云剑法', '滕青山']);
  });

  it('boosts by exactly 3: 3 x 4 passes 11 but not 13', () => {
    const rules = [rule({})];
    const beats = rankCandidates(
      [candidate('滕青山', 11), candidate('青云剑法', 4)],
      rules,
      TARGET
    );
    expect(beats[0].candidate.text).toBe('青云剑法');
    const loses = rankCandidates(
      [candidate('滕青山', 13), candidate('青云剑法', 4)],
      rules,
      TARGET
    );
    expect(loses[0].candidate.text).toBe('滕青山');
  });

  it('breaks a tie in boosted score by raw count, then text', () => {
    const ranked = rankCandidates(
      [candidate('乙乙', 6), candidate('甲甲', 6), candidate('青云剑法', 2)],
      [rule({})],
      TARGET
    );
    expect(ranked.map((row) => row.candidate.text)).toEqual(['乙乙', '甲甲', '青云剑法']);
  });

  it('re-ranks the same survivors when a rule changes', () => {
    const survivors = [candidate('滕青山', 10), candidate('青云剑法', 4)];
    expect(rankCandidates(survivors, [], TARGET)[0].candidate.text).toBe('滕青山');
    expect(rankCandidates(survivors, [rule({})], TARGET)[0].candidate.text).toBe('青云剑法');
  });

  it('cuts to MAX_RANKED after boosting, so a boosted candidate survives the cut', () => {
    const survivors = [
      ...Array.from({ length: MAX_RANKED }, (_, i) => candidate(`名${i}`, 100)),
      candidate('青云剑法', 50),
    ];
    const ranked = rankCandidates(survivors, [rule({})], TARGET);
    expect(ranked).toHaveLength(MAX_RANKED);
    expect(ranked[0].candidate.text).toBe('青云剑法');
  });
});

describe('filterByRule', () => {
  const ranked = rankCandidates(
    [candidate('滕青山', 10), candidate('青云剑法', 4)],
    [rule({})],
    TARGET
  );

  it('All keeps every row; Typed by rule and No rule split them', () => {
    expect(filterByRule(ranked, 'all')).toHaveLength(2);
    expect(filterByRule(ranked, 'rule').map((row) => row.candidate.text)).toEqual(['青云剑法']);
    expect(filterByRule(ranked, 'none').map((row) => row.candidate.text)).toEqual(['滕青山']);
  });
});

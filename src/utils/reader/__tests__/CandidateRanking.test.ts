import { describe, expect, it } from 'vitest';
import { candidateType } from '../CandidateAdd';
import {
  candidateListView,
  MAX_RANKED,
  rankCandidates,
  type CandidateListChips,
  type LengthFilter,
  type RuleFilter,
} from '../CandidateRanking';
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

describe('length ordering', () => {
  it('breaks an equal-count tie toward the longer text', () => {
    const ranked = rankCandidates([candidate('乙乙', 5), candidate('甲甲甲甲', 5)], [], TARGET);
    expect(ranked.map((row) => row.candidate.text)).toEqual(['甲甲甲甲', '乙乙']);
  });
});

describe('candidateListView', () => {
  const ALL: CandidateListChips = { filter: 'all', length: 'all', limit: 'all', sort: 'likely' };
  const notAdded = (): boolean => false;
  /** Ranked by count, highest first: each text's count is its position from the end. */
  const rankedOf = (texts: string[], rules: TransformRule[] = []) =>
    rankCandidates(
      texts.map((text, i) => candidate(text, texts.length - i)),
      rules,
      TARGET
    );
  const shown = (view: { rows: { candidate: Candidate }[] }): string[] =>
    view.rows.map((row) => row.candidate.text);

  it('with every chip at All, lists the ranked rows in rank order', () => {
    const ranked = rankedOf(['甲甲', '乙乙', '丙丙']);
    expect(shown(candidateListView(ranked, [], notAdded, ALL))).toEqual(['甲甲', '乙乙', '丙丙']);
  });

  it('rule chips: Typed by rule and No rule split the rows', () => {
    const ranked = rankCandidates(
      [candidate('滕青山', 10), candidate('青云剑法', 4)],
      [rule({})],
      TARGET
    );
    const view = (filter: RuleFilter) =>
      shown(candidateListView(ranked, [], notAdded, { ...ALL, filter }));
    expect(view('all')).toHaveLength(2);
    expect(view('rule')).toEqual(['青云剑法']);
    expect(view('none')).toEqual(['滕青山']);
  });

  it('length chips keep exactly the asked length, and 5+ keeps five and up', () => {
    const ranked = rankedOf(['甲甲', '乙乙乙', '丙丙丙丙', '丁丁丁丁丁', '戊戊戊戊戊戊']);
    const view = (length: LengthFilter) =>
      shown(candidateListView(ranked, [], notAdded, { ...ALL, length }));
    expect(view(2)).toEqual(['甲甲']);
    expect(view(3)).toEqual(['乙乙乙']);
    expect(view(4)).toEqual(['丙丙丙丙']);
    expect(view('5+')).toEqual(['丁丁丁丁丁', '戊戊戊戊戊戊']);
  });

  it('Top N keeps the first N in likelihood order', () => {
    const many = rankedOf(Array.from({ length: 120 }, (_, i) => `名${String(i).padStart(3, '0')}`));
    expect(shown(candidateListView(many, [], notAdded, { ...ALL, limit: 100 }))).toEqual(
      shown(candidateListView(many, [], notAdded, ALL)).slice(0, 100)
    );
    const few = rankedOf(['甲甲', '乙乙']);
    expect(shown(candidateListView(few, [], notAdded, { ...ALL, limit: 100 }))).toEqual([
      '甲甲',
      '乙乙',
    ]);
  });

  it('cuts after the length filter, so Top N of a length is that length only', () => {
    const many = rankedOf([
      ...Array.from({ length: 150 }, (_, i) => `乙${String(i).padStart(3, '0')}`), // 4 chars
      ...Array.from({ length: 150 }, (_, i) => `甲${String.fromCodePoint(0x4e00 + i)}`), // 2 chars
    ]);
    const view = shown(candidateListView(many, [], notAdded, { ...ALL, length: 2, limit: 100 }));
    expect(view).toHaveLength(100);
    expect(view.every((text) => [...text].length === 2)).toBe(true);
  });

  it('Longest reorders only the rows the cut kept, keeping likelihood order within a length', () => {
    const ranked = rankCandidates(
      [
        candidate('甲甲', 9),
        candidate('乙乙乙', 2),
        candidate('丙丙', 4),
        candidate('丁丁丁丁', 1),
      ],
      [],
      TARGET
    );
    expect(shown(candidateListView(ranked, [], notAdded, { ...ALL, sort: 'length' }))).toEqual([
      '丁丁丁丁',
      '乙乙乙',
      '甲甲',
      '丙丙',
    ]);
    const many = rankedOf([
      ...Array.from({ length: 100 }, (_, i) => `甲${String(i).padStart(2, '0')}`), // 3 chars
      '乙乙乙乙乙', // rank 101: outside Top 100
    ]);
    const longest = shown(
      candidateListView(many, [], notAdded, { ...ALL, limit: 100, sort: 'length' })
    );
    expect(longest).toHaveLength(100);
    expect(longest).not.toContain('乙乙乙乙乙');
  });

  it('dismissed and added rows leave, and only the added ones are counted', () => {
    const ranked = rankedOf(['甲甲', '乙乙', '丙丙', '丁丁']);
    const view = candidateListView(
      ranked,
      ['乙乙'],
      (text) => text === '丙丙' || text === '乙乙',
      ALL
    );
    expect(shown(view)).toEqual(['甲甲', '丁丁']);
    // 乙乙 is dismissed as well as added: a dismissed row is not counted as added.
    expect(view.added).toBe(1);
  });

  it('counts added rows whatever the chips hide', () => {
    const ranked = rankedOf(['甲甲', '乙乙乙']);
    const view = candidateListView(ranked, [], (text) => text === '乙乙乙', { ...ALL, length: 2 });
    expect(view.added).toBe(1);
  });

  it('Top N refills after an Add or a dismiss: the cut comes after both leave (ADR-111)', () => {
    const many = rankedOf(Array.from({ length: 101 }, (_, i) => `名${String(i).padStart(3, '0')}`));
    const first = many[0].candidate.text;
    const second = many[1].candidate.text;
    const rank101 = many[100].candidate.text;
    const before = shown(candidateListView(many, [], notAdded, { ...ALL, limit: 100 }));
    expect(before).not.toContain(rank101);
    const afterAdd = shown(
      candidateListView(many, [], (text) => text === first, { ...ALL, limit: 100 })
    );
    expect(afterAdd).toHaveLength(100);
    expect(afterAdd).toContain(rank101);
    const afterDismiss = shown(candidateListView(many, [second], notAdded, { ...ALL, limit: 100 }));
    expect(afterDismiss).toHaveLength(100);
    expect(afterDismiss).toContain(rank101);
  });
});

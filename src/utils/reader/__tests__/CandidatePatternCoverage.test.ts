import { describe, expect, it } from 'vitest';
import { activePatternIds, patternCoverage } from '../CandidatePatternCoverage';
import { rankCandidates } from '../CandidateRanking';

const dictionaries = {
  phrases: { 卡片: { allowAsPatternVariable: true }, 不可: { allowAsPatternVariable: false } },
  'properNouns-f_Novel': { 张三: {}, 魔王: {} },
  patterns: { '#级X': {} },
  'patterns-f_Novel': { '#星X': {}, X上的Y: {}, 魔法书: {}, '#号.楼': {} },
  'patterns-f_Other': { '#星牌': {} },
};
const active = ['properNouns-f_Novel'];

describe('activePatternIds', () => {
  it('is the root plus the pair of each active paired dictionary', () => {
    expect(activePatternIds(['properNouns-f_Novel', 'properNouns'])).toEqual([
      'patterns',
      'patterns-f_Novel',
    ]);
  });
});

describe('patternCoverage', () => {
  const covered = patternCoverage(dictionaries, active);

  it('covers a numeral filling # in an active pattern, whole text only', () => {
    expect(covered('三星卡片')).toBe(true);
    expect(covered('十二星卡片')).toBe(true);
    expect(covered('他三星卡片')).toBe(false);
    expect(covered('三星卡片们')).toBe(false);
    expect(covered('星卡片')).toBe(false);
  });

  it('covers a literal-only pattern', () => {
    expect(covered('魔法书')).toBe(true);
  });

  it('covers a slot filled by a known variable, not by an unknown string', () => {
    expect(covered('三星卡片')).toBe(true);
    expect(covered('三星滕青山')).toBe(false);
    expect(covered('三星不可')).toBe(false);
    expect(covered('魔法书上的卡片')).toBe(false);
    expect(covered('张三上的魔王')).toBe(true);
  });

  it('ignores an inactive pair and treats regex characters as literal', () => {
    expect(covered('三星牌')).toBe(false);
    expect(covered('三号a楼')).toBe(false);
  });
});

describe('rankCandidates with pattern coverage', () => {
  it('drops covered candidates before ranking', () => {
    const candidates = ['三星卡片', '滕青山'].map((text) => ({
      text,
      count: 5,
      lineCount: 5,
      alsoIn: [],
    }));
    const rows = rankCandidates(
      candidates,
      [],
      'properNouns-f_Novel',
      patternCoverage(dictionaries, active)
    );
    expect(rows.map((row) => row.candidate.text)).toEqual(['滕青山']);
  });
});

import { describe, expect, it } from 'vitest';
import { activePatternIds, patternCoverage } from '../CandidatePatternCoverage';

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

  it('finds a key whose first literal comes after a slot or a numeral', () => {
    const late = patternCoverage(
      { phrases: dictionaries.phrases, patterns: { X之门: {}, '#重天': {} } },
      []
    );
    expect(late('卡片之门')).toBe(true);
    expect(late('九重天')).toBe(true);
    expect(late('滕青山之门')).toBe(false);
  });

  it('tries a key with no literal against every text', () => {
    const bare = patternCoverage({ phrases: dictionaries.phrases, patterns: { '#X': {} } }, []);
    expect(bare('三卡片')).toBe(true);
    expect(bare('三滕青山')).toBe(false);
  });

  it('reads # with the numerals NumberVariable reads, up to its longest span', () => {
    const numbers = patternCoverage({ patterns: { '#层': {} } }, []);
    expect(numbers('两层')).toBe(true);
    expect(numbers('八千八百八十八万层')).toBe(true);
    expect(numbers('一二三四五六七八九层')).toBe(false);
  });
});

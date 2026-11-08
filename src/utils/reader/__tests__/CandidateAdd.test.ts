import { describe, expect, it } from 'vitest';
import { candidateAddChoices, isCandidateAdded, typeProvenance } from '../CandidateAdd';
import type { TransformRule } from '../../../types/TransformRuleTypes';

const DICTIONARIES = {
  phrases: { 你好: 'xin chào' },
  properNouns: { 张三: 'Trương Tam' },
  'properNouns-f_Novel': { 滕青山: 'Đằng Thanh Sơn' },
  'properNouns-_Generic': {},
  'properNouns-f_Other': { 赤焰山: 'Xích Diễm Sơn' },
  'patterns-f_Novel': { 他说: 'x' },
};

const VIEW = {
  defaultQuickAddDictionary: 'properNouns-f_Novel',
  activeProperNouns: ['properNouns', 'properNouns-f_Novel', 'properNouns-_Generic'],
};

describe('candidateAddChoices', () => {
  it('lists only the active proper-noun dictionaries and opens on the fiction one', () => {
    expect(candidateAddChoices(VIEW, DICTIONARIES)).toEqual({
      opened: 'properNouns-f_Novel',
      choices: ['properNouns-f_Novel', 'properNouns', 'properNouns-_Generic'],
    });
  });

  it('orders the choices opened first, then root, then alphabetical, whatever the disk order', () => {
    const shuffled = {
      'properNouns-f_Zeta': {},
      'properNouns-_Generic': {},
      'properNouns-f_Novel': {},
      properNouns: {},
      'properNouns-f_Alpha': {},
    };
    const view = {
      defaultQuickAddDictionary: 'properNouns-f_Novel',
      activeProperNouns: Object.keys(shuffled),
    };
    expect(candidateAddChoices(view, shuffled).choices).toEqual([
      'properNouns-f_Novel',
      'properNouns',
      'properNouns-_Generic',
      'properNouns-f_Alpha',
      'properNouns-f_Zeta',
    ]);
  });

  it('opens on the root dictionary when no config could be read', () => {
    expect(candidateAddChoices(null, DICTIONARIES)).toEqual({
      opened: 'properNouns',
      choices: ['properNouns'],
    });
  });
});

describe('isCandidateAdded', () => {
  const { choices } = candidateAddChoices(VIEW, DICTIONARIES);

  it('is true once a dictionary the row can add to holds the source', () => {
    expect(isCandidateAdded('滕青山', DICTIONARIES, choices)).toBe(true);
    expect(isCandidateAdded('张三', DICTIONARIES, choices)).toBe(true);
  });

  it('ignores inactive proper-noun dictionaries, phrases and patterns', () => {
    expect(isCandidateAdded('赤焰山', DICTIONARIES, choices)).toBe(false);
    expect(isCandidateAdded('你好', DICTIONARIES, choices)).toBe(false);
    expect(isCandidateAdded('他说', DICTIONARIES, choices)).toBe(false);
  });

  it('counts the fallback root target when no config could be read', () => {
    const { choices: fallback } = candidateAddChoices(null, DICTIONARIES);
    expect(isCandidateAdded('张三', DICTIONARIES, fallback)).toBe(true);
  });
});

describe('typeProvenance', () => {
  const rule = (overrides: Partial<TransformRule>): TransformRule => ({
    id: 'r',
    matchKind: 'suffix',
    key: '剑法',
    relocate: true,
    capitalizeExceptN: 1,
    semanticType: 'object',
    enabled: true,
    ...overrides,
  });

  it('names the matching rule and the type it gives', () => {
    expect(typeProvenance([rule({})], '青云剑法', 'properNouns')).toBe(
      'object, from the rule 剑法'
    );
  });

  it('says the type is the default when no enabled rule matches', () => {
    const disabled = rule({ enabled: false });
    expect(typeProvenance([disabled], '青云剑法', 'properNouns')).toBe(
      'character, the default: no matching rule'
    );
  });
});

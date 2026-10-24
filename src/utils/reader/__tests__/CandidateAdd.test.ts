import { describe, expect, it } from 'vitest';
import { candidateAddChoices, isCandidateAdded } from '../CandidateAdd';

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
      choices: ['properNouns', 'properNouns-f_Novel', 'properNouns-_Generic'],
    });
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

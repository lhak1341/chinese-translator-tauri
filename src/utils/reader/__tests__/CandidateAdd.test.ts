import { describe, expect, it, vi } from 'vitest';
import {
  candidateAddChoices,
  createCandidateAdder,
  isCandidateAdded,
  typeProvenance,
} from '../CandidateAdd';
import { initialEntryGuess } from '../../dictionary/TransformRuleEngine';
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

describe('createCandidateAdder', () => {
  const SWORD_RULE: TransformRule = {
    id: 'sword',
    matchKind: 'suffix',
    key: '剑法',
    relocate: false,
    capitalizeExceptN: 0,
    semanticType: 'object',
    enabled: true,
  };
  const OPENED = 'properNouns-f_Novel';
  const dictionaries = {
    properNouns: {},
    [OPENED]: { 滕青山: 'Đằng Thanh Sơn' },
    characters: { 青: 'thanh', 云: 'vân', 剑: 'kiếm', 法: 'pháp' },
  };
  const rank = vi.fn(() => []);
  function makeAdder() {
    const writers = {
      addEntry: vi.fn().mockResolvedValue(undefined),
      addEntries: vi.fn().mockResolvedValue(undefined),
    };
    const adder = createCandidateAdder({
      addChoices: { opened: OPENED, choices: [OPENED, 'properNouns'] },
      dictionaries,
      rules: [SWORD_RULE],
      rank,
      writers,
    });
    return { adder, writers };
  }

  it('add writes the translation trimmed, never as a pattern variable, with the type shown', async () => {
    const { adder, writers } = makeAdder();
    await adder.add('青云剑法', OPENED, '  Thanh Vân Kiếm Pháp ', 'object');
    expect(writers.addEntry).toHaveBeenCalledWith(OPENED, '青云剑法', 'Thanh Vân Kiếm Pháp', {
      allowAsPatternVariable: false,
      semanticType: 'object',
    });
    await adder.add('云梦泽', 'properNouns', 'Vân Mộng Trạch', '');
    expect(writers.addEntry).toHaveBeenLastCalledWith('properNouns', '云梦泽', 'Vân Mộng Trạch', {
      allowAsPatternVariable: false,
      semanticType: undefined,
    });
    expect(writers.addEntries).not.toHaveBeenCalled();
  });

  it('addAll writes every row the way add would, in one addEntries call', async () => {
    const { adder, writers } = makeAdder();
    await adder.addAll([
      {
        text: '青云剑法',
        dictionaryId: OPENED,
        translation: ' Kiếm Pháp ',
        semanticType: 'object',
      },
      { text: '云梦泽', dictionaryId: 'properNouns', translation: 'Vân Mộng', semanticType: '' },
    ]);
    expect(writers.addEntries).toHaveBeenCalledOnce();
    expect(writers.addEntries).toHaveBeenCalledWith([
      {
        dictionaryId: OPENED,
        source: '青云剑法',
        translation: 'Kiếm Pháp',
        metadata: { allowAsPatternVariable: false, semanticType: 'object' },
      },
      {
        dictionaryId: 'properNouns',
        source: '云梦泽',
        translation: 'Vân Mộng',
        metadata: { allowAsPatternVariable: false, semanticType: undefined },
      },
    ]);
    expect(writers.addEntry).not.toHaveBeenCalled();
  });

  it('the type a row shows, the note explaining it and the Add form guess agree', () => {
    const { adder } = makeAdder();
    for (const text of ['青云剑法', '滕青山']) {
      const formGuess = initialEntryGuess([SWORD_RULE], dictionaries, text, OPENED);
      expect(adder.typeFor(text, OPENED).semanticType).toBe(formGuess.semanticType);
      expect(adder.typeNote(text, OPENED)).toMatch(new RegExp(`^${formGuess.semanticType},`));
      expect(adder.guess(text, OPENED)).toBe(formGuess.translation);
    }
    expect(adder.typeFor('青云剑法', OPENED)).toEqual({ semanticType: 'object', ruled: true });
  });

  it('reads the dropdown it was given, and the dictionaries for what is already added', () => {
    const { adder } = makeAdder();
    expect(adder.opened).toBe(OPENED);
    expect(adder.choices).toEqual([OPENED, 'properNouns']);
    expect(adder.isAdded('滕青山')).toBe(true);
    expect(adder.isAdded('青云剑法')).toBe(false);
  });

  it("hands out the rank it was given, so its identity is the caller's", () => {
    expect(makeAdder().adder.rank).toBe(rank);
  });
});

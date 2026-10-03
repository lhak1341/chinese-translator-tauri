import { describe, test, expect } from 'vitest';
import {
  kindOf,
  tierOf,
  isFictionProperNounsId,
  isFictionPatternsId,
  hasPairedPatterns,
  isPairedPatternsId,
  toPatternsId,
  toProperNounsId,
  toProperNounsDictionaryId,
  otherPairedTierId,
  entryCapabilities,
  showsSemanticType,
  dictionaryNameProblem,
  MAX_DICTIONARY_NAME_LENGTH,
} from '../dictionary/DictionaryIdClassifier';

// Every id shape that exists on disk (the id space is closed: fixed names, or ids built by
// toProperNounsDictionaryId / toPatternsId), plus one unknown.
describe.each([
  // id                          kind            tier
  ['properNouns', 'properNouns', 'root'],
  ['properNouns-f_DuongThan', 'properNouns', 'fiction'],
  ['properNouns-_AiCap', 'properNouns', 'generic'],
  ['properNouns-HarryPotter', 'properNouns', 'custom'],
  ['patterns', 'patterns', 'root'],
  ['patterns-f_DuongThan', 'patterns', 'fiction'],
  ['patterns-_AiCap', 'patterns', 'generic'],
  ['phrases', 'phrases', 'root'],
  ['characters', 'lookupTable', 'root'],
  ['conversion', 'lookupTable', 'root'],
  ['punctuation', 'lookupTable', 'root'],
  ['somethingDroppedInByHand', 'lookupTable', 'root'],
] as const)('%s', (id, kind, tier) => {
  test(`kindOf is ${kind}`, () => expect(kindOf(id)).toBe(kind));
  test(`tierOf is ${tier}`, () => expect(tierOf(id)).toBe(tier));
  test('fiction predicates agree with kind + tier', () => {
    expect(isFictionProperNounsId(id)).toBe(kind === 'properNouns' && tier === 'fiction');
    expect(isFictionPatternsId(id)).toBe(kind === 'patterns' && tier === 'fiction');
  });
  test('pair predicates hold for fiction and generic tiers only', () => {
    const paired = tier === 'fiction' || tier === 'generic';
    expect(hasPairedPatterns(id)).toBe(kind === 'properNouns' && paired);
    expect(isPairedPatternsId(id)).toBe(kind === 'patterns' && paired);
  });
});

describe('toPatternsId', () => {
  test('derives paired patterns id from a fiction proper-nouns id', () => {
    expect(toPatternsId('properNouns-f_DuongThan')).toBe('patterns-f_DuongThan');
  });
  test('derives paired patterns id from a generic proper-nouns id', () => {
    expect(toPatternsId('properNouns-_AiCap')).toBe('patterns-_AiCap');
  });
});

describe('otherPairedTierId', () => {
  test('promotes fiction to generic under the same name', () => {
    expect(otherPairedTierId('properNouns-f_DuongThan')).toBe('properNouns-_DuongThan');
  });
  test('demotes generic to fiction under the same name', () => {
    expect(otherPairedTierId('properNouns-_AiCap')).toBe('properNouns-f_AiCap');
  });
  test('round-trips', () => {
    expect(otherPairedTierId(otherPairedTierId('properNouns-f_X')!)).toBe('properNouns-f_X');
  });
  test.each(['properNouns', 'properNouns-Custom', 'patterns-f_X', 'phrases'])(
    '%s has no other tier',
    (id) => {
      expect(otherPairedTierId(id)).toBeNull();
    }
  );
});

describe('toProperNounsId', () => {
  test('derives paired proper-nouns id from a fiction patterns id', () => {
    expect(toProperNounsId('patterns-f_DuongThan')).toBe('properNouns-f_DuongThan');
  });
});

describe('toProperNounsDictionaryId', () => {
  test('prefixes the raw name with properNouns-', () => {
    expect(toProperNounsDictionaryId('HarryPotter')).toBe('properNouns-HarryPotter');
  });

  test('strips internal whitespace', () => {
    expect(toProperNounsDictionaryId('Harry Potter')).toBe('properNouns-HarryPotter');
  });

  test('trims leading/trailing whitespace', () => {
    expect(toProperNounsDictionaryId('  Harry Potter  ')).toBe('properNouns-HarryPotter');
  });

  test('produces a fiction id when the raw name already carries the f_ convention', () => {
    expect(toProperNounsDictionaryId('f_HarryPotter')).toBe('properNouns-f_HarryPotter');
  });
});

describe('round-trip', () => {
  test('toProperNounsId(toPatternsId(id)) === id', () => {
    const id = 'properNouns-f_HarryPotter';
    expect(toProperNounsId(toPatternsId(id))).toBe(id);
  });

  test('toPatternsId(toProperNounsId(id)) === id', () => {
    const id = 'patterns-f_HarryPotter';
    expect(toPatternsId(toProperNounsId(id))).toBe(id);
  });
});

describe('entryCapabilities', () => {
  test.each([
    // id                        variableFlag  semantic          variableTypes
    ['patterns', 'toggle', 'whenVariable', true],
    ['patterns-f_DuongThan', 'toggle', 'whenVariable', true],
    ['phrases', 'toggle', 'whenVariable', false],
    ['properNouns', 'always', 'always', false],
    ['properNouns-_AiCap', 'always', 'always', false],
    ['characters', 'none', 'none', false],
    ['somethingUnknown', 'none', 'none', false],
  ])('%s', (id, variableFlag, semantic, variableTypes) => {
    expect(entryCapabilities(id)).toEqual({ variableFlag, semantic, variableTypes });
  });
});

describe('showsSemanticType', () => {
  test.each([
    // id              VAR    shows
    ['properNouns-f_X', false, true],
    ['properNouns-f_X', true, true],
    ['phrases', false, false],
    ['phrases', true, true],
    ['patterns', false, false],
    ['patterns', true, true],
    ['characters', true, false],
  ])('%s with VAR %s → %s', (id, allowAsPatternVariable, shows) => {
    expect(showsSemanticType(id, allowAsPatternVariable)).toBe(shows);
  });
});

describe('dictionaryNameProblem', () => {
  test.each(['Custom', 'f_TruTien', '_AiCap', 'My Novel', 'v2.1-beta'])(
    'accepts %s (spaces are stripped, as the id is built)',
    (name) => {
      expect(dictionaryNameProblem(name)).toBeNull();
    }
  );

  test.each([
    ['Tây Du Ký', /letters A-Z \(no accents\)/],
    ['Foo!', /letters A-Z/],
    ['a..b', /'\.\.'/],
  ])('refuses %s with words a reader can act on', (name, message) => {
    expect(dictionaryNameProblem(name)).toMatch(message);
  });

  test('the limit leaves room for the properNouns- prefix, so 88 characters fit and 89 do not', () => {
    expect(MAX_DICTIONARY_NAME_LENGTH).toBe(88);
    expect(dictionaryNameProblem('a'.repeat(88))).toBeNull();
    expect(dictionaryNameProblem('a'.repeat(89))).toMatch(/88 characters or fewer/);
  });

  test('the limit counts the name after whitespace is stripped, as the id does', () => {
    expect(dictionaryNameProblem(`${'a'.repeat(88)}   `)).toBeNull();
  });
});

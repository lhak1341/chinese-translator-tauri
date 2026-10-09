import { describe, expect, test } from 'vitest';
import {
  findBestMatch,
  ruleMatches,
  joinCharGloss,
  applyRule,
  findConflict,
  dictionarySupportsTransformRules,
  findRuleMatchingEntries,
  compareRulePrecedence,
  deriveCapitalizeExceptNForKeyEdit,
  initialEntryGuess,
  previewRuleGuess,
} from '../dictionary/TransformRuleEngine';
import type { TransformRule } from '../../types/TransformRuleTypes';

function rule(overrides: Partial<TransformRule>): TransformRule {
  return {
    id: 'id',
    matchKind: 'suffix',
    key: '城',
    relocate: true,
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

describe('compareRulePrecedence', () => {
  test('all suffix rules sort before all prefix rules, regardless of key length', () => {
    const longPrefix = rule({ id: 'long-prefix', matchKind: 'prefix', key: '南京卫' });
    const shortSuffix = rule({ id: 'short-suffix', matchKind: 'suffix', key: '城' });
    const sorted = [longPrefix, shortSuffix].sort(compareRulePrecedence);
    expect(sorted).toEqual([shortSuffix, longPrefix]);
  });

  test('within one matchKind, longer key sorts first', () => {
    const shortRule = rule({ id: 'short', matchKind: 'suffix', key: '城' });
    const longRule = rule({ id: 'long', matchKind: 'suffix', key: '卫城' });
    expect([shortRule, longRule].sort(compareRulePrecedence)).toEqual([longRule, shortRule]);
  });

  test('within equal key length, key text breaks the tie alphabetically', () => {
    const ruleB = rule({ id: 'b', matchKind: 'suffix', key: 'b' });
    const ruleA = rule({ id: 'a', matchKind: 'suffix', key: 'a' });
    expect([ruleB, ruleA].sort(compareRulePrecedence)).toEqual([ruleA, ruleB]);
  });

  test('within equal key length and text, semanticType breaks the final tie', () => {
    const zRule = rule({ id: 'z', matchKind: 'suffix', key: '城', semanticType: 'object' });
    const aRule = rule({ id: 'a', matchKind: 'suffix', key: '城', semanticType: 'location' });
    expect([zRule, aRule].sort(compareRulePrecedence)).toEqual([aRule, zRule]);
  });
});

describe('applyRule', () => {
  test('suffix rule: capitalize-except-last-N runs before move-last-N-to-front (canonical worked example)', () => {
    const r = rule({ matchKind: 'suffix', key: '城', relocate: true, capitalizeExceptN: 1 });
    expect(applyRule(r, '南京城', glossFn)).toBe('thanh Nam Kinh');
  });

  test('prefix rule: capitalize-except-first-N runs before move-first-N-to-end (mirrored)', () => {
    const r = rule({ matchKind: 'prefix', key: '南', relocate: true, capitalizeExceptN: 1 });
    // Source "南京城" glosses to "nam kinh thanh"; capitalizeExceptFirstN(_,1) keeps "nam"
    // lowercase and title-cases the rest -> "nam Kinh Thanh"; moveFirstNWordsToEnd(_,1)
    // moves "nam" to the end -> "Kinh Thanh nam".
    expect(applyRule(r, '南京城', glossFn)).toBe('Kinh Thanh nam');
  });

  test('relocate=false, capitalizeExceptN=0 title-cases every word and does not reorder', () => {
    const r = rule({ matchKind: 'suffix', key: '城', relocate: false, capitalizeExceptN: 0 });
    expect(applyRule(r, '南京城', glossFn)).toBe('Nam Kinh Thanh');
  });

  test('suffix rule with moveReplacement drops the moved words and prepends the replacement', () => {
    const r = rule({
      matchKind: 'suffix',
      key: '城',
      relocate: true,
      capitalizeExceptN: 1,
      moveReplacement: 'thanh pho',
    });
    expect(applyRule(r, '南京城', glossFn)).toBe('thanh pho Nam Kinh');
  });

  test('prefix rule with moveReplacement drops the moved words and appends the replacement', () => {
    const r = rule({
      matchKind: 'prefix',
      key: '南',
      relocate: true,
      capitalizeExceptN: 1,
      moveReplacement: 'mien nam',
    });
    expect(applyRule(r, '南京城', glossFn)).toBe('Kinh Thanh mien nam');
  });

  test('suffix rule with moveReplacement and relocate=false replaces the key words in place — no relocation', () => {
    const r = rule({
      matchKind: 'suffix',
      key: '京城', // 2 chars
      relocate: false,
      capitalizeExceptN: 1,
      moveReplacement: 'thanh pho',
    });
    expect(applyRule(r, '南京城', glossFn)).toBe('Nam thanh pho');
  });

  test('prefix rule with moveReplacement and relocate=false replaces the key words in place — no relocation', () => {
    const r = rule({
      matchKind: 'prefix',
      key: '南',
      relocate: false,
      capitalizeExceptN: 1,
      moveReplacement: 'mien nam',
    });
    expect(applyRule(r, '南京城', glossFn)).toBe('mien nam Kinh Thanh');
  });
});

describe('deriveCapitalizeExceptNForKeyEdit', () => {
  test('re-derives to the new key length when the length changes', () => {
    expect(deriveCapitalizeExceptNForKeyEdit('城', '紫禁城', 1)).toBe(3);
  });

  test('leaves currentValue untouched on a same-length edit (typo fix)', () => {
    expect(deriveCapitalizeExceptNForKeyEdit('城', '巿', 2)).toBe(2);
  });

  test('starting from an empty old key always re-derives (create path)', () => {
    expect(deriveCapitalizeExceptNForKeyEdit('', '城', 0)).toBe(1);
  });

  test('surrogate-pair-safe: counts by codepoint, not UTF-16 code unit', () => {
    // U+20000 is one Han codepoint but two UTF-16 code units.
    expect(deriveCapitalizeExceptNForKeyEdit('城', '\u{20000}', 1)).toBe(1);
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

describe('findRuleMatchingEntries', () => {
  const dictionaries = {
    phrases: {
      南京城: { translation: 'nam kinh thanh' },
      北京城: { translation: 'bac kinh thanh' },
      南京: { translation: 'nam kinh' },
    },
    'properNouns-f_Test': {
      西安城: { translation: 'tay an thanh' },
    },
    patterns: {
      X城: { translation: 'X thanh' }, // patterns dict — must be excluded
    },
  };

  test('matches entries across every supported dictionary, sorted alphabetically within a length', () => {
    const r = rule({ matchKind: 'suffix', key: '城' });
    const result = findRuleMatchingEntries(r, dictionaries);
    expect(result.map((row) => row.source)).toEqual(['北京城', '南京城', '西安城']);
  });

  test('longer sources sort first, regardless of alphabetical order', () => {
    const longThenShort = {
      phrases: {
        南京城: { translation: 'nam kinh thanh' }, // 3 chars
        古南京城: { translation: 'co nam kinh thanh' }, // 4 chars, alphabetically after 南京城
      },
    };
    const r = rule({ matchKind: 'suffix', key: '城' });
    const result = findRuleMatchingEntries(r, longThenShort);
    expect(result.map((row) => row.source)).toEqual(['古南京城', '南京城']);
  });

  test('reads a string-valued entry and an object entry through the same fields', () => {
    const mixed = {
      phrases: {
        南京城: 'nam kinh thanh',
        北京城: {
          translation: 'bac kinh thanh',
          semanticType: 'location',
          allowAsPatternVariable: true,
          allowedVariableTypes: { X: ['location'] },
        },
      },
    };
    const r = rule({ matchKind: 'suffix', key: '城' });
    const [bac, nam] = findRuleMatchingEntries(r, mixed as any);

    expect(nam).toMatchObject({
      translation: 'nam kinh thanh',
      semanticType: '',
      allowAsPatternVariable: false,
      allowedVariableTypes: {},
    });
    expect(bac).toMatchObject({
      translation: 'bac kinh thanh',
      semanticType: 'location',
      allowAsPatternVariable: true,
      allowedVariableTypes: { X: ['location'] },
    });
  });

  test('excludes dictionaries that do not support Transform Rules (e.g. patterns)', () => {
    const r = rule({ matchKind: 'suffix', key: '城' });
    const result = findRuleMatchingEntries(r, dictionaries);
    expect(result.some((row) => row.dictionaryId === 'patterns')).toBe(false);
  });

  test('excludes entries not matching the key', () => {
    const r = rule({ matchKind: 'suffix', key: '城' });
    const result = findRuleMatchingEntries(r, dictionaries);
    expect(result.some((row) => row.source === '南京')).toBe(false);
  });

  test('ignores rule.enabled — previews matches for disabled rules too', () => {
    const r = rule({ matchKind: 'suffix', key: '城', enabled: false });
    const result = findRuleMatchingEntries(r, dictionaries);
    expect(result.map((row) => row.source)).toEqual(['北京城', '南京城', '西安城']);
  });

  test('returns each row with its translation and dictionaryId', () => {
    const r = rule({ matchKind: 'suffix', key: '城' });
    const result = findRuleMatchingEntries(r, dictionaries);
    expect(result).toContainEqual(
      expect.objectContaining({
        source: '南京城',
        translation: 'nam kinh thanh',
        dictionaryId: 'phrases',
      })
    );
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

describe('initialEntryGuess', () => {
  const dictionaries = { characters: GLOSS };
  const cityRule = rule({});
  const otherRule = rule({ key: '市' });

  // 南京城's gloss is "nam kinh thanh"; the suffix rule capitalizes all but the last word
  // ("Nam Kinh thanh") and moves that word to the front.
  test.each([
    ['properNouns-f_Novel', [cityRule], 'thanh Nam Kinh', 'Nam Kinh Thanh', 'location'],
    ['phrases', [cityRule], 'thanh Nam Kinh', 'nam kinh thanh', 'location'],
    ['properNouns-f_Novel', [otherRule], 'Nam Kinh Thanh', 'Nam Kinh Thanh', 'character'],
    ['phrases', [otherRule], 'nam kinh thanh', 'nam kinh thanh', ''],
    ['patterns', [cityRule], 'nam kinh thanh', 'nam kinh thanh', ''],
  ])('%s with %o', (target, rules, translation, roughGloss, semanticType) => {
    expect(initialEntryGuess(rules, dictionaries, '南京城', target)).toEqual({
      translation,
      roughGloss,
      semanticType,
    });
  });

  test('no characters dictionary — empty guess, the kind default semanticType', () => {
    expect(initialEntryGuess([otherRule], {}, '南京城', 'properNouns')).toEqual({
      translation: '',
      roughGloss: '',
      semanticType: 'character',
    });
  });
});

describe('previewRuleGuess', () => {
  const dictionaries = { characters: GLOSS };
  const draft = rule({ id: 'draft' }); // suffix 城: "thanh Nam Kinh" for 南京城
  const longer = rule({ id: 'longer', key: '京城', relocate: false, capitalizeExceptN: 0 });

  test.each([
    // name                               rules                                  source    target          guess              winner
    ['the draft alone wins', [], '南京城', 'properNouns-f_X', 'thanh Nam Kinh', 'draft'],
    [
      'a longer suffix shadows the draft',
      [longer],
      '南京城',
      'properNouns-f_X',
      'Nam Kinh Thanh',
      'longer',
    ],
    [
      'a suffix draft beats a prefix rule',
      [rule({ id: 'prefix', matchKind: 'prefix', key: '南京' })],
      '南京城',
      'phrases',
      'thanh Nam Kinh',
      'draft',
    ],
    [
      'a disabled rule never shadows',
      [{ ...longer, enabled: false }],
      '南京城',
      'phrases',
      'thanh Nam Kinh',
      'draft',
    ],
    ['no rule matches: the rough gloss', [], '南京卫', 'phrases', 'nam kinh ve', null],
  ] as const)('%s', (_name, rules, source, target, guess, winnerId) => {
    const result = previewRuleGuess(draft, [...rules], dictionaries, source, target);
    expect(result.guess).toBe(guess);
    expect(result.winner?.id ?? null).toBe(winnerId);
  });

  test('a draft being written counts as enabled', () => {
    const result = previewRuleGuess(
      { ...draft, enabled: false },
      [],
      dictionaries,
      '南京城',
      'phrases'
    );
    expect(result.winner?.id).toBe('draft');
  });
});

// A character is a code point: 𠮷 (U+20BB7) is one character, two UTF-16 units. `parseValidatedKey`
// already counts keys this way, so every count and split in the engine has to agree with it.
describe('astral-plane characters count as one', () => {
  const dictionaries = { characters: { 京: 'kinh', 城: 'thanh', 𠮷: 'cat' } };
  const gloss = (text: string) => joinCharGloss(dictionaries, text);

  test('charCount counts characters, not UTF-16 units', () => {
    const three = rule({ charCount: 3 });
    const four = rule({ charCount: 4 });
    expect(ruleMatches(three, '𠮷京城')).toBe(true);
    expect(ruleMatches(four, '𠮷京城')).toBe(false);
  });

  test('joinCharGloss keeps an astral character whole', () => {
    const result = joinCharGloss({ characters: { 京: 'kinh', 城: 'thanh' } }, '𠮷京城');
    expect(result).toBe('𠮷 kinh thanh');
    expect(result.isWellFormed()).toBe(true);
  });

  test('joinCharGloss looks an astral character up in the characters dictionary', () => {
    expect(gloss('𠮷京')).toBe('cat kinh');
  });

  test('a suffix rule on a source with an astral character gives a well-formed guess', () => {
    const result = applyRule(rule({ key: '城' }), '𠮷京城', gloss);
    expect(result).toBe('thanh Cat Kinh');
    expect(result.isWellFormed()).toBe(true);
  });

  test('a prefix rule with an astral key moves the whole character', () => {
    const prefix = rule({ matchKind: 'prefix', key: '𠮷', capitalizeExceptN: 1 });
    const result = applyRule(prefix, '𠮷京城', gloss);
    expect(result).toBe('Kinh Thanh cat');
    expect(result.isWellFormed()).toBe(true);
  });

  test('an astral key is measured in characters when rules are ranked', () => {
    const twoAstral = rule({ id: 'astral', key: '𠮷𠀀' }); // 2 characters, 4 UTF-16 units
    const threeBmp = rule({ id: 'bmp', key: '南京卫' }); // 3 characters, 3 UTF-16 units
    expect([twoAstral, threeBmp].sort(compareRulePrecedence)).toEqual([threeBmp, twoAstral]);
  });

  test('entries sort by character count, then alphabetically', () => {
    const dicts = {
      phrases: {
        '𠮷京城': { translation: 'a' }, // 3 characters, 4 UTF-16 units
        南京城: { translation: 'b' }, // 3 characters, 3 UTF-16 units
      },
    };
    const result = findRuleMatchingEntries(rule({ key: '城' }), dicts);
    expect(result.map((row) => row.source)).toEqual(['南京城', '𠮷京城']);
  });
});

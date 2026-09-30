import { describe, expect, test } from 'vitest';
import {
  parseValidatedNumber,
  parseValidatedKey,
  isValidMatchKind,
  isValidSemanticType,
  validateTransformRule,
  commitRuleField,
  commitRuleDraft,
  ruleDraftProblem,
  draftAsRule,
  DRAFT_RULE_ID,
} from '../TransformRuleValidation';
import type { TransformRule } from '../../../types/TransformRuleTypes';

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '城',
    relocate: true,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    ...overrides,
  };
}

const VALID_RULE: TransformRule = {
  id: 'r1',
  matchKind: 'suffix',
  key: '城',
  relocate: true,
  capitalizeExceptN: 1,
  semanticType: 'location',
  enabled: true,
};

describe('parseValidatedNumber', () => {
  test('accepts a value equal to the minimum', () => {
    expect(parseValidatedNumber('0', 0)).toBe(0);
    expect(parseValidatedNumber('1', 1)).toBe(1);
  });

  test('accepts a value above the minimum', () => {
    expect(parseValidatedNumber('5', 0)).toBe(5);
  });

  test('rejects a value below the minimum', () => {
    expect(parseValidatedNumber('-1', 0)).toBeNull();
    expect(parseValidatedNumber('0', 1)).toBeNull();
  });

  test('rejects non-numeric input', () => {
    expect(parseValidatedNumber('abc', 0)).toBeNull();
  });

  test('empty string parses to 0 (Number(""))', () => {
    expect(parseValidatedNumber('', 0)).toBe(0);
    expect(parseValidatedNumber('', 1)).toBeNull();
  });

  test('accepts fractional values — integer-ness is not enforced', () => {
    expect(parseValidatedNumber('2.5', 0)).toBe(2.5);
  });

  test('rejects Infinity', () => {
    expect(parseValidatedNumber('Infinity', 0)).toBeNull();
  });
});

describe('parseValidatedKey', () => {
  test('accepts 1 to 4 Han characters', () => {
    expect(parseValidatedKey('城')).toBe('城');
    expect(parseValidatedKey('南京城')).toBe('南京城');
    expect(parseValidatedKey('紫禁城市')).toBe('紫禁城市');
  });

  test('trims surrounding whitespace before validating', () => {
    expect(parseValidatedKey('  城  ')).toBe('城');
  });

  test('rejects empty (or whitespace-only) input', () => {
    expect(parseValidatedKey('')).toBeNull();
    expect(parseValidatedKey('   ')).toBeNull();
  });

  test('rejects more than 4 characters', () => {
    expect(parseValidatedKey('紫禁城市区')).toBeNull();
  });

  test('rejects non-Han characters, including mixed-script input', () => {
    expect(parseValidatedKey('abc')).toBeNull();
    expect(parseValidatedKey('城a')).toBeNull();
  });

  test('accepts an astral-plane (surrogate-pair) CJK extension character', () => {
    expect(parseValidatedKey('\u{20000}')).toBe('\u{20000}');
  });
});

describe('isValidMatchKind', () => {
  test('accepts suffix and prefix', () => {
    expect(isValidMatchKind('suffix')).toBe(true);
    expect(isValidMatchKind('prefix')).toBe(true);
  });

  test('rejects any other string', () => {
    expect(isValidMatchKind('both')).toBe(false);
    expect(isValidMatchKind('')).toBe(false);
  });

  test('rejects non-string values', () => {
    expect(isValidMatchKind(1)).toBe(false);
    expect(isValidMatchKind(null)).toBe(false);
    expect(isValidMatchKind(undefined)).toBe(false);
  });
});

describe('isValidSemanticType', () => {
  test('accepts every real SemanticType value', () => {
    for (const t of ['character', 'creature', 'location', 'organization', 'concept', 'object']) {
      expect(isValidSemanticType(t)).toBe(true);
    }
  });

  test('rejects an unknown string', () => {
    expect(isValidSemanticType('phrase')).toBe(false);
  });

  test('rejects non-string values', () => {
    expect(isValidSemanticType(0)).toBe(false);
    expect(isValidSemanticType({})).toBe(false);
  });
});

describe('validateTransformRule', () => {
  test('accepts a well-formed rule unchanged', () => {
    expect(validateTransformRule(makeRaw())).toEqual(VALID_RULE);
  });

  test('accepts optional fields when present and valid', () => {
    const raw = makeRaw({ charCount: 3, moveReplacement: 'dãy núi', label: 'test rule' });
    expect(validateTransformRule(raw)).toEqual({
      ...VALID_RULE,
      charCount: 3,
      moveReplacement: 'dãy núi',
      label: 'test rule',
    });
  });

  test('drops the rule when charCount is present but invalid', () => {
    expect(validateTransformRule(makeRaw({ charCount: 0 }))).toBeNull(); // min is 1
    expect(validateTransformRule(makeRaw({ charCount: 'abc' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ charCount: true }))).toBeNull();
  });

  test('drops the rule when moveReplacement is present but not a string', () => {
    expect(validateTransformRule(makeRaw({ moveReplacement: 5 }))).toBeNull();
  });

  test('drops the rule when label is present but not a string', () => {
    expect(validateTransformRule(makeRaw({ label: 5 }))).toBeNull();
  });

  test('rejects non-object input', () => {
    expect(validateTransformRule(null)).toBeNull();
    expect(validateTransformRule(undefined)).toBeNull();
    expect(validateTransformRule('rule')).toBeNull();
    expect(validateTransformRule(42)).toBeNull();
    expect(validateTransformRule([])).toBeNull();
  });

  test('rejects a missing or non-string id', () => {
    const { id: _id, ...withoutId } = makeRaw();
    expect(validateTransformRule(withoutId)).toBeNull();
    expect(validateTransformRule(makeRaw({ id: '' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ id: 42 }))).toBeNull();
  });

  test('rejects an invalid matchKind', () => {
    expect(validateTransformRule(makeRaw({ matchKind: 'both' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ matchKind: undefined }))).toBeNull();
  });

  test('rejects a key outside the 1-4 Han-character contract', () => {
    expect(validateTransformRule(makeRaw({ key: '' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ key: '紫禁城市区' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ key: 'abc' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ key: 42 }))).toBeNull();
  });

  test('trims a whitespace-padded key rather than dropping the rule', () => {
    expect(validateTransformRule(makeRaw({ key: '  城  ' }))).toEqual(VALID_RULE);
  });

  test('rejects a non-boolean relocate', () => {
    expect(validateTransformRule(makeRaw({ relocate: 1 }))).toBeNull();
    expect(validateTransformRule(makeRaw({ relocate: 'true' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ relocate: undefined }))).toBeNull();
  });

  test('rejects a non-numeric capitalizeExceptN', () => {
    expect(validateTransformRule(makeRaw({ capitalizeExceptN: 'abc' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ capitalizeExceptN: -1 }))).toBeNull();
    expect(validateTransformRule(makeRaw({ capitalizeExceptN: true }))).toBeNull();
    expect(validateTransformRule(makeRaw({ capitalizeExceptN: undefined }))).toBeNull();
  });

  test('accepts a stringified capitalizeExceptN, coercing it to a number', () => {
    expect(validateTransformRule(makeRaw({ capitalizeExceptN: '2' }))).toEqual({
      ...VALID_RULE,
      capitalizeExceptN: 2,
    });
  });

  test('rejects an invalid semanticType', () => {
    expect(validateTransformRule(makeRaw({ semanticType: 'phrase' }))).toBeNull();
    expect(validateTransformRule(makeRaw({ semanticType: undefined }))).toBeNull();
  });

  test('rejects a non-boolean enabled', () => {
    expect(validateTransformRule(makeRaw({ enabled: 1 }))).toBeNull();
    expect(validateTransformRule(makeRaw({ enabled: undefined }))).toBeNull();
  });
});

describe('validateTransformRule — empty optional text is absent', () => {
  test.each(['', '   '])('label %j and moveReplacement %j load as absent', (empty) => {
    expect(validateTransformRule(makeRaw({ label: empty, moveReplacement: empty }))).toEqual(
      VALID_RULE
    );
  });
});

describe('commitRuleField', () => {
  const rule: TransformRule = {
    ...VALID_RULE,
    charCount: 3,
    capitalizeExceptN: 2,
    moveReplacement: 'thành',
    label: 'City',
  };

  test.each([
    // field               raw       expected change (undefined key = removed), or null = rejected
    ['charCount', '5', { charCount: 5 }],
    ['charCount', '', { charCount: undefined }],
    ['charCount', '  ', { charCount: undefined }],
    ['charCount', '0', null],
    ['charCount', 'x', null],
    ['capitalizeExceptN', '0', { capitalizeExceptN: 0 }],
    ['capitalizeExceptN', '', null],
    ['capitalizeExceptN', '-1', null],
    ['moveReplacement', '  dãy núi ', { moveReplacement: 'dãy núi' }],
    ['moveReplacement', '', { moveReplacement: undefined }],
    ['moveReplacement', '   ', { moveReplacement: undefined }],
    ['label', ' Walls ', { label: 'Walls' }],
    ['label', '', { label: undefined }],
    ['label', '  ', { label: undefined }],
    ['key', ' 卫 ', { key: '卫' }],
    ['key', '', null],
    ['key', 'abc', null],
  ] as const)('%s ← %j', (field, raw, change) => {
    const committed = commitRuleField(rule, field, raw);
    if (change === null) {
      expect(committed).toBeNull();
      return;
    }
    const expected: Record<string, unknown> = { ...rule, ...change };
    for (const [k, v] of Object.entries(change)) if (v === undefined) delete expected[k];
    expect(committed).toEqual(expected);
  });

  test('a key of a new length re-derives capitalizeExceptN; the same length keeps it', () => {
    expect(commitRuleField(rule, 'key', '卫城')).toMatchObject({
      key: '卫城',
      capitalizeExceptN: 2,
    });
    expect(commitRuleField(rule, 'key', '卫城门')).toMatchObject({ capitalizeExceptN: 3 });
    expect(commitRuleField({ ...rule, key: '卫城' }, 'key', '南城')).toMatchObject({
      capitalizeExceptN: 2,
    });
  });
});

describe('commitRuleDraft', () => {
  const { id: _id, ...draft } = VALID_RULE;

  test('trims the key and optional text, and drops empty optional text', () => {
    expect(
      commitRuleDraft({ ...draft, key: ' 城 ', label: '  ', moveReplacement: ' thành ' })
    ).toEqual({ ...draft, key: '城', moveReplacement: 'thành' });
  });

  test('null for an invalid key, lowercase count, or length limit', () => {
    expect(commitRuleDraft({ ...draft, key: 'abc' })).toBeNull();
    expect(commitRuleDraft({ ...draft, capitalizeExceptN: Number.NaN })).toBeNull();
    expect(commitRuleDraft({ ...draft, charCount: 0 })).toBeNull();
  });
});

describe('ruleDraftProblem', () => {
  const { id: _id, ...draft } = VALID_RULE;

  test('most urgent first: conflict, key, lowercase count, length limit', () => {
    const bad = { ...draft, key: 'abc', capitalizeExceptN: Number.NaN, charCount: 0 };
    expect(ruleDraftProblem(bad, 'City')).toBe(
      'Conflicts with "City" — same match kind + key already used.'
    );
    expect(ruleDraftProblem(bad, null)).toBe('Key must be 1-4 Chinese characters.');
    expect(ruleDraftProblem({ ...bad, key: '城' }, null)).toBe(
      'The lowercase count must be a non-negative number.'
    );
    expect(ruleDraftProblem({ ...draft, charCount: 0 }, null)).toBe(
      'The length limit must be at least 1.'
    );
    expect(ruleDraftProblem(draft, null)).toBeNull();
  });
});

describe('draftAsRule', () => {
  test('trims the key as Save will, and carries the draft id, for the conflict check and preview alike', () => {
    const draft = {
      matchKind: 'suffix' as const,
      key: ' 城 ',
      relocate: false,
      capitalizeExceptN: 1,
      semanticType: 'location' as const,
      enabled: true,
    };
    expect(draftAsRule(draft)).toEqual({ ...draft, key: '城', id: DRAFT_RULE_ID });
  });
});

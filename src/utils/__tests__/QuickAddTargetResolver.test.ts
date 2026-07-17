import { describe, test, expect } from 'vitest';
import {
  resolveDefaultProperNounTarget,
  resolveStructuralPatternQuickAddTarget,
  resolveAndVerifyStructuralPatternTarget,
} from '../dictionary/QuickAddTargetResolver';

describe('resolveDefaultProperNounTarget', () => {
  test('returns the default dict when it is still active', () => {
    expect(
      resolveDefaultProperNounTarget('properNouns-Foo', ['properNouns-Foo', 'properNouns-Bar'])
    ).toBe('properNouns-Foo');
  });

  test('falls back to the first active custom proper-nouns dict (sorted) when default is stale', () => {
    expect(
      resolveDefaultProperNounTarget('properNouns-Gone', ['properNouns-Zeta', 'properNouns-Alpha'])
    ).toBe('properNouns-Alpha');
  });

  test('falls back when default is null', () => {
    expect(resolveDefaultProperNounTarget(null, ['properNouns-Alpha'])).toBe('properNouns-Alpha');
  });

  test('returns undefined when no custom proper-nouns dict is active', () => {
    expect(resolveDefaultProperNounTarget(null, ['properNouns'])).toBeUndefined();
  });
});

describe('resolveStructuralPatternQuickAddTarget', () => {
  test('pairs the default dict when it is a fiction dict', () => {
    expect(
      resolveStructuralPatternQuickAddTarget('properNouns-f_DuongThan', ['properNouns-f_DuongThan'])
    ).toBe('patterns-f_DuongThan');
  });

  test('falls back to the first active fiction dict (sorted) when default is not fiction', () => {
    expect(
      resolveStructuralPatternQuickAddTarget('properNouns-Bar', [
        'properNouns-Bar',
        'properNouns-f_Zeta',
        'properNouns-f_Alpha',
      ])
    ).toBe('patterns-f_Alpha');
  });

  test('falls back when default is null', () => {
    expect(resolveStructuralPatternQuickAddTarget(null, ['properNouns-f_Alpha'])).toBe(
      'patterns-f_Alpha'
    );
  });

  test('returns undefined when no active fiction dict exists', () => {
    expect(resolveStructuralPatternQuickAddTarget(null, ['properNouns'])).toBeUndefined();
  });
});

describe('resolveAndVerifyStructuralPatternTarget', () => {
  test('returns the target when it resolves and is present in dictionaries', () => {
    expect(
      resolveAndVerifyStructuralPatternTarget(
        'properNouns-f_DuongThan',
        ['properNouns-f_DuongThan'],
        { 'patterns-f_DuongThan': {} }
      )
    ).toBe('patterns-f_DuongThan');
  });

  test('returns undefined when it resolves but is absent from dictionaries', () => {
    expect(
      resolveAndVerifyStructuralPatternTarget(
        'properNouns-f_DuongThan',
        ['properNouns-f_DuongThan'],
        {}
      )
    ).toBeUndefined();
  });

  test('returns undefined when no target resolves at all, regardless of dictionaries', () => {
    expect(
      resolveAndVerifyStructuralPatternTarget(null, ['properNouns'], {
        'patterns-f_Unrelated': {},
      })
    ).toBeUndefined();
  });
});

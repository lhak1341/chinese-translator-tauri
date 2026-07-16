import { describe, test, expect } from 'vitest';
import {
  resolveDefaultProperNounTarget,
  resolveStructuralPatternQuickAddTarget,
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

/**
 * The token source taxonomy through its interface: building a consumed source, recognising it,
 * and the consumed-token contract that ties both to `translated`. Ranking itself is pinned in
 * TranslationEngine.sourceStrings.test.js.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorSpy = vi.hoisted(() => vi.fn());
vi.mock('../logger', () => ({ logger: { error: errorSpy, warn: vi.fn(), log: vi.fn() } }));

import {
  PHASE_PRIORITIES,
  consumedSource,
  getSourcePriority,
  isConsumedSource,
  isPatternSource,
  validateConsumedTokenContract,
} from '../TranslationSourcePriority';

beforeEach(() => errorSpy.mockClear());

describe('consumedSource / isConsumedSource', () => {
  it('round-trips for every static leader source', () => {
    for (const leader of Object.keys(PHASE_PRIORITIES)) {
      const follower = consumedSource(leader);
      expect(isConsumedSource(follower)).toBe(true);
      expect(isConsumedSource(follower, leader)).toBe(true);
      expect(isConsumedSource(leader)).toBe(false);
      expect(getSourcePriority(follower)).toBeNull();
    }
  });

  it('round-trips for a dynamic proper-noun dictionary source', () => {
    const follower = consumedSource('properNouns-MyNovel');
    expect(isConsumedSource(follower)).toBe(true);
    expect(isConsumedSource(follower, 'properNouns-MyNovel')).toBe(true);
  });

  it('matches a follower only against its own leader when one is given', () => {
    expect(isConsumedSource('phrases_consumed', 'number_conversion')).toBe(false);
    expect(isConsumedSource('number_conversion_consumed', 'number_conversion')).toBe(true);
  });

  it('is false for empty sources', () => {
    expect(isConsumedSource(null)).toBe(false);
    expect(isConsumedSource(undefined)).toBe(false);
    expect(isConsumedSource('')).toBe(false);
  });
});

describe('isPatternSource', () => {
  it.each(['hierarchical_pattern', 'hierarchical_patterns', 'hierarchical_patterns_composite'])(
    'accepts %s',
    (source) => expect(isPatternSource(source)).toBe(true)
  );

  it.each([
    'phrases',
    'characters',
    'number_conversion',
    'pattern',
    'pattern_consumed',
    '',
    null,
    undefined,
  ])('rejects %s', (source) =>
    expect(isPatternSource(source as string | null | undefined)).toBe(false)
  );
});

describe('validateConsumedTokenContract', () => {
  it('stays silent for well-formed leaders and followers', () => {
    const tokens = [
      { value: '三', translated: 'ba', translationSource: 'number_conversion' },
      { value: '个', translated: null, translationSource: consumedSource('number_conversion') },
      { value: '人', translated: 'người', translationSource: 'characters' },
      { value: '无', translated: undefined, translationSource: null },
    ];

    validateConsumedTokenContract(tokens, 'numbers');

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('corrects a consumed token whose translated is not null (direction A)', () => {
    const tokens = [{ value: '个', translated: undefined, translationSource: 'phrases_consumed' }];

    validateConsumedTokenContract(tokens, 'phrases');

    expect(tokens[0].translated).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('consumed token contract violation');
  });

  it('flags a leader whose translated is null (direction B)', () => {
    const tokens = [{ value: '人', translated: null, translationSource: 'characters' }];

    validateConsumedTokenContract(tokens, 'characters');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('leader token contract violation');
  });

  it('flags a leader source that ranks 999', () => {
    const tokens = [{ value: '人', translated: 'người', translationSource: 'patterns' }];

    validateConsumedTokenContract(tokens, 'patterns');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('unrecognised leader source');
  });

  it('accepts a proper-noun leader only when its dictionary is active', () => {
    const tokens = [
      { value: '孔宣', translated: 'Khổng Tuyên', translationSource: 'properNouns-X' },
    ];

    validateConsumedTokenContract(tokens, 'properNouns', ['properNouns-X']);
    expect(errorSpy).not.toHaveBeenCalled();

    validateConsumedTokenContract(tokens, 'properNouns', []);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

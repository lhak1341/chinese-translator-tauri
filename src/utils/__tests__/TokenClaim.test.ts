import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorSpy = vi.hoisted(() => vi.fn());
vi.mock('../logger', () => ({ logger: { error: errorSpy, warn: vi.fn(), log: vi.fn() } }));

import {
  claimSpan,
  claimGroupedSpan,
  isClaimed,
  placeSpan,
  placeGroupedSpan,
  type ClaimableToken,
} from '../TokenClaim';

function tokens(values: string[]): ClaimableToken[] {
  return values.map((value, i) => ({
    value,
    end: i + value.length,
    translated: null,
    translationSource: null,
  }));
}

beforeEach(() => errorSpy.mockClear());

describe('claimSpan (light shape)', () => {
  it('gives the leader the translation and consumes each follower, pointing back at the leader', () => {
    const t = tokens(['a', 'b', 'c', 'd']);
    claimSpan(t, 1, 3, 'hierarchical_pattern', 'X');
    expect(t[1]).toMatchObject({ translated: 'X', translationSource: 'hierarchical_pattern' });
    for (const i of [2, 3]) {
      expect(t[i]).toMatchObject({
        translated: null,
        translationSource: 'hierarchical_pattern_consumed',
        groupLeader: 1,
      });
    }
    expect(t[0].translationSource).toBeNull();
  });

  it('writes no grouping fields, and leaves the leader value alone', () => {
    const t = tokens(['a', 'b']);
    claimSpan(t, 0, 1, 'number_conversion', '2');
    expect(t[0].isGrouped).toBeUndefined();
    expect(t[0].groupedWith).toBeUndefined();
    expect(t[1].isGrouped).toBeUndefined();
    expect(t[0].value).toBe('a');
  });

  it('derives the follower source from the leader source', () => {
    const t = tokens(['a', 'b']);
    claimSpan(t, 0, 1, 'hierarchical_pattern', 'X');
    expect(t[1].translationSource).toBe('hierarchical_pattern_consumed');
  });

  it('skips an index past the end of the tokens', () => {
    const t = tokens(['a', 'b']);
    expect(() => claimSpan(t, 0, 4, 'hierarchical_pattern', 'X')).not.toThrow();
    expect(t[1].translationSource).toBe('hierarchical_pattern_consumed');
  });

  it('logs a leader with no translation', () => {
    claimSpan(tokens(['a']), 0, 0, 'hierarchical_pattern', null as unknown as string);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('has no translation'));
  });

  it('logs a source that ranks 999, and one that is a consumed source', () => {
    claimSpan(tokens(['a']), 0, 0, 'patterns', 'X');
    claimSpan(tokens(['a']), 0, 0, 'hierarchical_pattern_consumed', 'X');
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not a ranked leader source'));
  });

  it('accepts a proper-noun dictionary name that is active, and logs it when it is not', () => {
    claimSpan(tokens(['a']), 0, 0, 'properNouns-f_X', 'X', ['properNouns-f_X']);
    expect(errorSpy).not.toHaveBeenCalled();
    claimSpan(tokens(['a']), 0, 0, 'properNouns-f_X', 'X', []);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('claimGroupedSpan (grouped shape)', () => {
  it('rewrites the leader to the grouped text and records the followers', () => {
    const t = tokens(['不', '知', '道']);
    claimGroupedSpan(t, 0, 3, 'phrases', 'không biết', '不知道');
    expect(t[0]).toMatchObject({
      value: '不知道',
      originalValue: '不',
      end: t[2].end,
      translated: 'không biết',
      translationSource: 'phrases',
      isGrouped: true,
      groupedWith: [1, 2],
    });
  });

  it('consumes each follower: null translation, consumed source, groupLeader, isGrouped', () => {
    const t = tokens(['不', '知', '道']);
    claimGroupedSpan(t, 0, 3, 'phrases', 'x', '不知道');
    for (const i of [1, 2]) {
      expect(t[i]).toMatchObject({
        translated: null,
        translationSource: 'phrases_consumed',
        groupLeader: 0,
        isGrouped: true,
      });
    }
  });

  it('keeps each follower value, and records it as originalValue', () => {
    const t = tokens(['a', 'b']);
    claimGroupedSpan(t, 0, 2, 'phrases', 'x', 'ab');
    expect(t[1].value).toBe('b');
    expect(t[1].originalValue).toBe('b');
  });

  it('does not overwrite an originalValue that is already set', () => {
    const t = tokens(['ab', 'c']);
    t[0].originalValue = 'a';
    claimGroupedSpan(t, 0, 2, 'phrases', 'x', 'abc');
    expect(t[0].originalValue).toBe('a');
  });

  it('appends to an existing groupedWith list', () => {
    const t = tokens(['a', 'b', 'c']);
    t[0].groupedWith = [99];
    claimGroupedSpan(t, 0, 2, 'phrases', 'x', 'ab');
    expect(t[0].groupedWith).toEqual([99, 1]);
  });

  it('claims a single token as a plain leader: translation and source only', () => {
    const t = tokens(['a', 'b']);
    claimGroupedSpan(t, 0, 1, 'characters', 'x', 'a');
    expect(t[0]).toMatchObject({ translated: 'x', translationSource: 'characters' });
    expect(t[0].isGrouped).toBeUndefined();
    expect(t[0].originalValue).toBeUndefined();
    expect(t[1].translationSource).toBeNull();
  });

  it('does not write past the end of the tokens', () => {
    const t = tokens(['a', 'b']);
    expect(() => claimGroupedSpan(t, 0, 5, 'phrases', 'x', 'abcde')).not.toThrow();
    expect(t[1].isGrouped).toBe(true);
    expect(t[0].groupedWith).toEqual([1]);
  });

  it('releases the followers of a Phase 1 leader it overwrites, beyond the new span', () => {
    // [a, b(pattern leader), c, d (its followers)]: a claim over a-b frees c and d.
    const t = tokens(['a', 'b', 'c', 'd']);
    t[1].translated = 'PAT';
    t[1].translationSource = 'hierarchical_pattern';
    for (const i of [2, 3]) {
      t[i].translationSource = 'hierarchical_pattern_consumed';
      t[i].groupLeader = 1;
    }
    claimGroupedSpan(t, 0, 2, 'properNouns', 'N', 'ab', ['properNouns']);
    for (const i of [2, 3]) {
      expect(t[i]).toMatchObject({
        translated: null,
        translationSource: null,
        isGrouped: false,
        groupLeader: null,
      });
    }
    expect(t[1].translationSource).toBe('properNouns_consumed');
  });

  it('stops releasing at the first token that is not an orphan', () => {
    const t = tokens(['a', 'b', 'c', 'd']);
    t[1].translated = 'PAT';
    t[1].translationSource = 'hierarchical_pattern';
    t[2].translationSource = 'hierarchical_pattern_consumed';
    t[2].groupLeader = 1;
    t[3].translated = 'D';
    t[3].translationSource = 'characters';
    claimGroupedSpan(t, 0, 2, 'properNouns', 'N', 'ab', ['properNouns']);
    expect(t[2].translationSource).toBeNull();
    expect(t[3]).toMatchObject({ translated: 'D', translationSource: 'characters' });
  });

  it('logs the same leader violations as claimSpan', () => {
    claimGroupedSpan(tokens(['a', 'b']), 0, 2, 'phrase', 'x', 'ab');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not a ranked leader source'));
  });
});

describe('isClaimed (the read side)', () => {
  it('is false for a fresh token, and true once either field is set', () => {
    const [fresh] = tokens(['a']);
    expect(isClaimed(fresh)).toBe(false);
    expect(isClaimed({ translated: 'A', translationSource: null })).toBe(true);
    expect(
      isClaimed({ translated: null, translationSource: 'hierarchical_pattern_consumed' })
    ).toBe(true);
  });

  it('holds for every token of a light span after claimSpan', () => {
    const t = tokens(['a', 'b', 'c']);
    claimSpan(t, 0, 2, 'hierarchical_pattern', 'ABC');
    expect(t.map(isClaimed)).toEqual([true, true, true]);
  });

  it('holds for every token of a grouped span after claimGroupedSpan', () => {
    const t = tokens(['a', 'b', 'c', 'd']);
    claimGroupedSpan(t, 1, 2, 'phrases', 'BC', 'bc');
    expect(t.map(isClaimed)).toEqual([false, true, true, false]);
  });

  it('is false again for the orphans a grouped claim releases', () => {
    const t = tokens(['a', 'b', 'c', 'd']);
    claimSpan(t, 1, 3, 'hierarchical_pattern', 'BCD');
    claimGroupedSpan(t, 0, 2, 'properNouns', 'N', 'ab', ['properNouns']);
    expect(t.map(isClaimed)).toEqual([true, true, false, false]);
  });
});

function recorder() {
  const calls: unknown[][] = [];
  return {
    calls,
    addUnit: (...args: unknown[]) => {
      calls.push(args);
      return true;
    },
  };
}

describe('placeSpan (light claim plus its unit)', () => {
  it('claims the span and records one unit from the same source and translation', () => {
    const t = tokens(['a', 'b', 'c']);
    const builder = recorder();
    placeSpan(t, 1, 2, 'number_conversion', '2', 'bc', { builder, chunkOffset: 10 });
    expect(t[1]).toMatchObject({ translated: '2', translationSource: 'number_conversion' });
    expect(t[2]).toMatchObject({ translated: null, groupLeader: 1 });
    expect(builder.calls).toEqual([['bc', '2', 'number_conversion', 11]]);
  });

  it('applies no offset when the sink has none', () => {
    const builder = recorder();
    placeSpan(tokens(['a', 'b']), 1, 1, 'hierarchical_pattern', 'X', 'b', { builder });
    expect(builder.calls).toEqual([['b', 'X', 'hierarchical_pattern', 1]]);
  });

  it('claims without recording when the builder is null', () => {
    const t = tokens(['a', 'b']);
    placeSpan(t, 0, 1, 'hierarchical_pattern', 'X', 'ab', { builder: null });
    expect(t[0].translated).toBe('X');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a missing builder instead of skipping silently, and still claims', () => {
    const t = tokens(['a', 'b']);
    placeSpan(t, 0, 1, 'hierarchical_pattern', 'X', 'ab', { builder: undefined as never });
    expect(t[0].translated).toBe('X');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('placeGroupedSpan (grouped claim plus its unit)', () => {
  it('claims the span and records the grouped text as the unit, from the claim source', () => {
    const t = tokens(['a', 'b', 'c']);
    const builder = recorder();
    placeGroupedSpan(t, 0, 2, 'characters', 'X', 'ab', { builder, chunkOffset: 5 });
    expect(t[0]).toMatchObject({ isGrouped: true, value: 'ab', translationSource: 'characters' });
    expect(builder.calls).toEqual([['ab', 'X', 'characters', 5]]);
  });

  it('records one unit for the leader, however long the span', () => {
    const builder = recorder();
    placeGroupedSpan(tokens(['a', 'b', 'c']), 0, 3, 'phrases', 'X', 'abc', { builder });
    expect(builder.calls).toHaveLength(1);
  });

  it('claims without recording when the builder is null', () => {
    const t = tokens(['a', 'b']);
    placeGroupedSpan(t, 0, 2, 'phrases', 'X', 'ab', { builder: null });
    expect(t[0].translated).toBe('X');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

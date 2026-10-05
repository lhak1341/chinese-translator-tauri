/**
 * PrecomputedTokenStrings: the pos×span → joined-string cache the JS pattern matcher reads during
 * variable resolution. The only implementation since the WASM string tier was deleted (2026-10-05).
 */
import { describe, expect, it } from 'vitest';
import { PrecomputedTokenStrings } from '../pattern/PrecomputedTokenStrings.js';

const tokens = (...values: string[]) => values.map((value) => ({ value }));

describe('PrecomputedTokenStrings', () => {
  it('returns the joined values for every position and span', () => {
    const strings = new PrecomputedTokenStrings(tokens('一', '二', '三', '四'));
    expect(strings.getString(0, 1)).toBe('一');
    expect(strings.getString(0, 4)).toBe('一二三四');
    expect(strings.getString(1, 2)).toBe('二三');
    expect(strings.getString(3, 1)).toBe('四');
  });

  it('joins multi-character token values', () => {
    const strings = new PrecomputedTokenStrings(tokens('ab', 'c', '野家'));
    expect(strings.getString(0, 3)).toBe('abc野家');
  });

  it('returns null past the end of the tokens or past maxSpan', () => {
    const strings = new PrecomputedTokenStrings(tokens('一', '二', '三'), 2);
    expect(strings.getString(2, 2)).toBeNull();
    expect(strings.getString(0, 3)).toBeNull();
    expect(strings.getString(5, 1)).toBeNull();
  });

  it('defaults maxSpan to 10', () => {
    const many = tokens(...Array.from({ length: 12 }, (_, i) => String(i % 10)));
    const strings = new PrecomputedTokenStrings(many);
    expect(strings.getString(0, 10)).toBe('0123456789');
    expect(strings.getString(0, 11)).toBeNull();
  });

  it('returns null while disabled', () => {
    const strings = new PrecomputedTokenStrings(tokens('一', '二'));
    strings.enabled = false;
    expect(strings.getString(0, 1)).toBeNull();
  });

  it('agrees with generateDynamic for every cached key', () => {
    const list = tokens('一', 'ab', '三', '𠮷', '五');
    const strings = new PrecomputedTokenStrings(list);
    for (let position = 0; position < list.length; position++) {
      for (let span = 1; position + span <= list.length; span++) {
        expect(strings.getString(position, span)).toBe(
          PrecomputedTokenStrings.generateDynamic(list, position, span)
        );
      }
    }
  });

  it('counts lookups and misses', () => {
    const strings = new PrecomputedTokenStrings(tokens('一', '二'));
    strings.getString(0, 1);
    strings.getString(9, 1);
    expect(strings.getStats()).toMatchObject({
      totalLookups: 2,
      totalMisses: 1,
      cacheHitRate: 0.5,
    });
  });
});

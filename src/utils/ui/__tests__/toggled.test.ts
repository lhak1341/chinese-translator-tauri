import { describe, expect, test } from 'vitest';
import { toggled } from '../toggled';

describe('toggled', () => {
  test('adds a value that is absent', () => {
    expect(toggled(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']));
  });

  test('removes a value that is present', () => {
    expect(toggled(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']));
  });

  test('returns a new set and leaves the input alone', () => {
    const before = new Set(['a']);
    const after = toggled(before, 'b');
    expect(after).not.toBe(before);
    expect(before).toEqual(new Set(['a']));
  });
});

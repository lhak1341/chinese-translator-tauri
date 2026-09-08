import { describe, expect, test } from 'vitest';
import { extractHanChars } from '../RuleFieldValidation';

describe('extractHanChars', () => {
  test('extracts Han characters found anywhere in the text, skipping others', () => {
    expect(extractHanChars('the city of 城市', 4)).toBe('城市');
  });

  test('stops once max characters are collected', () => {
    expect(extractHanChars('紫禁城市区', 4)).toBe('紫禁城市');
  });

  test('returns an empty string when no Han characters are present', () => {
    expect(extractHanChars('hello world', 4)).toBe('');
  });

  test('preserves surrogate pairs (astral-plane CJK) intact', () => {
    expect(extractHanChars('a\u{20000}b', 4)).toBe('\u{20000}');
  });
});

import { describe, test, expect } from 'vitest';
import { validateTranslationInput } from '../TranslationInputValidator';

describe('validateTranslationInput', () => {
  describe('length', () => {
    test('accepts text within the limit', () => {
      const result = validateTranslationInput('A'.repeat(1000));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.failedCheck).toBeUndefined();
    });

    test('accepts text at the exact 500000-character limit', () => {
      expect(validateTranslationInput('A'.repeat(500000)).valid).toBe(true);
    });

    test('rejects text one character over the limit', () => {
      const result = validateTranslationInput('A'.repeat(500001));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Text too large');
      expect(result.failedCheck).toBe('length');
      expect(result.sizeKB).toBeGreaterThan(488);
      expect(result.maxKB).toBe(488);
    });

    test('puts the size and the maximum in the message', () => {
      const result = validateTranslationInput('A'.repeat(600000));
      expect(result.error).toMatch(/Text too large: \d+\.\d+KB\. Maximum allowed: \d+KB/);
      expect(result.sizeKB).toBeCloseTo(585.9, 1);
    });

    test('counts characters, not bytes', () => {
      expect(validateTranslationInput('你'.repeat(500000)).valid).toBe(true);
    });
  });

  describe('control characters', () => {
    test.each([
      ['NULL', '\x00'],
      ['SOH', '\x01'],
      ['BS', '\x08'],
      ['VT', '\x0B'],
      ['FF', '\x0C'],
      ['SO', '\x0E'],
      ['US', '\x1F'],
    ])('rejects %s', (_name, char) => {
      const result = validateTranslationInput(`Hello${char}World`);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text contains invalid control characters');
      expect(result.failedCheck).toBe('controlCharacters');
    });

    test.each([
      ['LF', '\n'],
      ['TAB', '\t'],
      ['CR', '\r'],
    ])('allows %s', (_name, char) => {
      expect(validateTranslationInput(`line${char}line`).valid).toBe(true);
    });
  });

  describe('combined', () => {
    test('accepts empty text', () => {
      expect(validateTranslationInput('').valid).toBe(true);
    });

    test('accepts Chinese, emoji, Vietnamese and punctuation', () => {
      const text = 'English 中文 Tiếng Việt 123 !@#$%\n\t你好世界🌍';
      expect(validateTranslationInput(text).valid).toBe(true);
    });

    test('checks length before control characters', () => {
      const result = validateTranslationInput('A'.repeat(500001) + '\x00');
      expect(result.failedCheck).toBe('length');
    });
  });
});

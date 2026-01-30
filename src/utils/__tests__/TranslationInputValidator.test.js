import { describe, test, expect } from 'vitest';
import { TranslationInputValidator } from '../TranslationInputValidator';

describe('TranslationInputValidator', () => {
  describe('constants', () => {
    test('MAX_TEXT_LENGTH is 500KB', () => {
      expect(TranslationInputValidator.MAX_TEXT_LENGTH).toBe(500000);
    });

    test('INVALID_CONTROL_CHARS_REGEX rejects invalid control characters', () => {
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x00')).toBe(true); // NULL
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x01')).toBe(true); // SOH
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x08')).toBe(true); // BS
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x0B')).toBe(true); // VT
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x0C')).toBe(true); // FF
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\x1F')).toBe(true); // US
    });

    test('INVALID_CONTROL_CHARS_REGEX allows valid control characters', () => {
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\n')).toBe(false); // LF (0x0A)
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\t')).toBe(false); // TAB (0x09)
      expect(TranslationInputValidator.INVALID_CONTROL_CHARS_REGEX.test('\r')).toBe(false); // CR (0x0D)
    });
  });

  describe('validateLength', () => {
    test('accepts text within limit', () => {
      const text = 'A'.repeat(1000);
      const result = TranslationInputValidator.validateLength(text);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts text at exact limit', () => {
      const text = 'A'.repeat(500000);
      const result = TranslationInputValidator.validateLength(text);
      expect(result.valid).toBe(true);
    });

    test('rejects text over limit', () => {
      const text = 'A'.repeat(500001);
      const result = TranslationInputValidator.validateLength(text);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Text too large');
      expect(result.sizeKB).toBeGreaterThan(488);
      expect(result.maxKB).toBe(488);
    });

    test('provides size information in error', () => {
      const text = 'A'.repeat(600000);
      const result = TranslationInputValidator.validateLength(text);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Text too large: \d+\.\d+KB\. Maximum allowed: \d+KB/);
      expect(result.sizeKB).toBeCloseTo(585.9, 1);
      expect(result.maxKB).toBe(488);
    });

    test('accepts empty string', () => {
      const result = TranslationInputValidator.validateLength('');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateControlCharacters', () => {
    test('accepts text with no control characters', () => {
      const text = 'Hello, 世界! 123';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts text with valid control characters (newline, tab, carriage return)', () => {
      const text = 'Line 1\nLine 2\tTabbed\rCarriage return';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(true);
    });

    test('rejects text with NULL character', () => {
      const text = 'Hello\x00World';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text contains invalid control characters');
    });

    test('rejects text with SOH character', () => {
      const text = 'Hello\x01World';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
    });

    test('rejects text with backspace character', () => {
      const text = 'Hello\x08World';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
    });

    test('rejects text with vertical tab character', () => {
      const text = 'Hello\x0BWorld';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
    });

    test('rejects text with form feed character', () => {
      const text = 'Hello\x0CWorld';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
    });

    test('rejects text with multiple invalid control characters', () => {
      const text = 'Hello\x00\x01\x08World';
      const result = TranslationInputValidator.validateControlCharacters(text);
      expect(result.valid).toBe(false);
    });

    test('accepts empty string', () => {
      const result = TranslationInputValidator.validateControlCharacters('');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateInput', () => {
    test('accepts valid input', () => {
      const text = 'Valid Chinese text: 你好世界\nMultiple lines\tWith tabs';
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.failedCheck).toBeUndefined();
    });

    test('rejects text that is too long', () => {
      const text = 'A'.repeat(500001);
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Text too large');
      expect(result.failedCheck).toBe('length');
    });

    test('rejects text with invalid control characters', () => {
      const text = 'Hello\x00World';
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text contains invalid control characters');
      expect(result.failedCheck).toBe('controlCharacters');
    });

    test('fails on first validation error (length checked before control chars)', () => {
      const text = 'A'.repeat(500001) + '\x00';
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(false);
      expect(result.failedCheck).toBe('length');
    });

    test('accepts empty string', () => {
      const result = TranslationInputValidator.validateInput('');
      expect(result.valid).toBe(true);
    });

    test('accepts text at maximum length without control characters', () => {
      const text = 'A'.repeat(500000);
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizeInput', () => {
    test('removes invalid control characters', () => {
      const text = 'Hello\x00World\x01Test\x08';
      const sanitized = TranslationInputValidator.sanitizeInput(text);
      expect(sanitized).toBe('HelloWorldTest');
    });

    test('preserves valid control characters', () => {
      const text = 'Line 1\nLine 2\tTabbed\rCarriage return';
      const sanitized = TranslationInputValidator.sanitizeInput(text);
      expect(sanitized).toBe(text);
    });

    test('preserves normal text', () => {
      const text = 'Hello, 世界! 123';
      const sanitized = TranslationInputValidator.sanitizeInput(text);
      expect(sanitized).toBe(text);
    });

    test('handles empty string', () => {
      const sanitized = TranslationInputValidator.sanitizeInput('');
      expect(sanitized).toBe('');
    });

    test('removes all invalid control character types', () => {
      const text = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C\x0E\x0F\x10\x1F';
      const sanitized = TranslationInputValidator.sanitizeInput(text);
      expect(sanitized).toBe('');
    });
  });

  describe('getValidationStats', () => {
    test('returns correct stats for valid text', () => {
      const text = 'Hello, World!';
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.length).toBe(13);
      expect(stats.sizeKB).toBeCloseTo(0.0, 1);
      expect(stats.hasInvalidControlChars).toBe(false);
      expect(stats.exceedsMaxLength).toBe(false);
    });

    test('detects text over limit', () => {
      const text = 'A'.repeat(500001);
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.length).toBe(500001);
      expect(stats.sizeKB).toBeGreaterThan(488);
      expect(stats.exceedsMaxLength).toBe(true);
    });

    test('detects invalid control characters', () => {
      const text = 'Hello\x00World';
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.hasInvalidControlChars).toBe(true);
    });

    test('calculates size correctly for large text', () => {
      const text = 'A'.repeat(10240); // 10KB
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.length).toBe(10240);
      expect(stats.sizeKB).toBe(10.0);
      expect(stats.exceedsMaxLength).toBe(false);
    });

    test('handles empty string', () => {
      const stats = TranslationInputValidator.getValidationStats('');
      expect(stats.length).toBe(0);
      expect(stats.sizeKB).toBe(0.0);
      expect(stats.hasInvalidControlChars).toBe(false);
      expect(stats.exceedsMaxLength).toBe(false);
    });

    test('handles text at exact limit', () => {
      const text = 'A'.repeat(500000);
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.length).toBe(500000);
      expect(stats.exceedsMaxLength).toBe(false);
    });

    test('handles text with valid control characters', () => {
      const text = 'Line 1\nLine 2\tTabbed';
      const stats = TranslationInputValidator.getValidationStats(text);
      expect(stats.hasInvalidControlChars).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('handles Unicode characters correctly', () => {
      const text = '你好世界🌍';
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(true);
    });

    test('handles mixed content correctly', () => {
      const text = 'English 中文 Tiếng Việt 123 !@#$%\n\t';
      const result = TranslationInputValidator.validateInput(text);
      expect(result.valid).toBe(true);
    });

    test('length validation uses character count, not byte count', () => {
      const text = '你'.repeat(500000); // Chinese characters
      const result = TranslationInputValidator.validateLength(text);
      expect(result.valid).toBe(true);
    });
  });
});

/**
 * Configuration Validation Tests
 *
 * Verifies that configuration and dictionary validation properly handles:
 * - Valid data structures
 * - Invalid types and missing fields
 * - Malformed or corrupted data
 * - Security edge cases (injection attempts, oversized data)
 */

import { describe, it, expect, vi } from 'vitest';
import { validateApiResult, sanitizeString } from '../configValidation';
import { ValidationError } from '../errors';

describe('validateApiResult', () => {
  it('should validate successful result with data', () => {
    const input = {
      success: true,
      data: { test: 'value' },
    };

    const result = validateApiResult(input, 'testOperation');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'value' });
  });

  it('should validate failed result with error message', () => {
    const input = {
      success: false,
      error: 'Test error',
    };

    const result = validateApiResult(input, 'testOperation');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
  });

  it('should throw on non-object result', () => {
    expect(() => {
      validateApiResult('not an object', 'testOperation');
    }).toThrow(ValidationError);

    expect(() => {
      validateApiResult(null, 'testOperation');
    }).toThrow(ValidationError);

    expect(() => {
      validateApiResult(undefined, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should throw on missing success field', () => {
    const input = {
      data: { test: 'value' },
    };

    expect(() => {
      validateApiResult(input, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should throw on non-boolean success field', () => {
    const input = {
      success: 'true', // String instead of boolean
      data: { test: 'value' },
    };

    expect(() => {
      validateApiResult(input, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should warn if success=true but no data', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = {
      success: true,
      // No data field
    };

    validateApiResult(input, 'testOperation');

    // Should not throw, but should warn
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should warn if success=false but no error message', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = {
      success: false,
      // No error field
    };

    validateApiResult(input, 'testOperation');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('sanitizeString', () => {
  it('should pass through normal strings', () => {
    const str = 'Hello, world! 你好世界';
    const result = sanitizeString(str);

    expect(result).toBe(str);
  });

  it('should remove control characters', () => {
    const str = 'Hello\x00World\x08Test\x1F';
    const result = sanitizeString(str);

    expect(result).toBe('HelloWorldTest');
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x08');
  });

  it('should preserve newlines and tabs', () => {
    const str = 'Line 1\nLine 2\tTabbed';
    const result = sanitizeString(str);

    expect(result).toBe(str);
  });

  it('should limit length to maxLength', () => {
    const str = 'a'.repeat(2000);
    const result = sanitizeString(str, 100);

    expect(result.length).toBe(100);
  });

  it('should use default maxLength of 1000', () => {
    const str = 'a'.repeat(2000);
    const result = sanitizeString(str);

    expect(result.length).toBe(1000);
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(123)).toBe('');
    expect(sanitizeString({})).toBe('');
    expect(sanitizeString([])).toBe('');
  });

  it('should handle Unicode correctly', () => {
    const str = '中文测试 🎉 Vietnamese test';
    const result = sanitizeString(str);

    expect(result).toBe(str);
  });
});

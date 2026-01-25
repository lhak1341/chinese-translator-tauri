/**
 * Configuration Validation Tests
 *
 * Verifies that configuration and dictionary validation properly handles:
 * - Valid data structures
 * - Invalid types and missing fields
 * - Malformed or corrupted data
 * - Security edge cases (injection attempts, oversized data)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateElectronResult,
  validateConfiguration,
  validateDictionary,
  validateDictionaryEntry,
  validateDictionaryList,
  sanitizeString,
  ValidationError,
  type ElectronAPIResult,
  type AppConfiguration,
  type Dictionary,
} from './configValidation';

describe('validateElectronResult', () => {
  it('should validate successful result with data', () => {
    const input = {
      success: true,
      data: { test: 'value' },
    };

    const result = validateElectronResult(input, 'testOperation');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'value' });
  });

  it('should validate failed result with error message', () => {
    const input = {
      success: false,
      error: 'Test error',
    };

    const result = validateElectronResult(input, 'testOperation');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
  });

  it('should throw on non-object result', () => {
    expect(() => {
      validateElectronResult('not an object', 'testOperation');
    }).toThrow(ValidationError);

    expect(() => {
      validateElectronResult(null, 'testOperation');
    }).toThrow(ValidationError);

    expect(() => {
      validateElectronResult(undefined, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should throw on missing success field', () => {
    const input = {
      data: { test: 'value' },
    };

    expect(() => {
      validateElectronResult(input, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should throw on non-boolean success field', () => {
    const input = {
      success: 'true', // String instead of boolean
      data: { test: 'value' },
    };

    expect(() => {
      validateElectronResult(input, 'testOperation');
    }).toThrow(ValidationError);
  });

  it('should warn if success=true but no data', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = {
      success: true,
      // No data field
    };

    validateElectronResult(input, 'testOperation');

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

    validateElectronResult(input, 'testOperation');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('validateConfiguration', () => {
  it('should validate complete valid configuration', () => {
    const config: AppConfiguration = {
      defaultQuickAddDictionary: 'properNouns-MyNovel',
      theme: 'dark',
      fontSize: 16,
      autoSave: false,
    };

    const result = validateConfiguration(config);

    expect(result.defaultQuickAddDictionary).toBe('properNouns-MyNovel');
    expect(result.theme).toBe('dark');
    expect(result.fontSize).toBe(16);
    expect(result.autoSave).toBe(false);
    expect(result.raw).toEqual(config);
  });

  it('should use defaults for null/undefined config', () => {
    const resultNull = validateConfiguration(null);
    const resultUndef = validateConfiguration(undefined);

    expect(resultNull.defaultQuickAddDictionary).toBe('properNouns');
    expect(resultNull.theme).toBe('system');
    expect(resultNull.fontSize).toBe(14);
    expect(resultNull.autoSave).toBe(true);

    expect(resultUndef).toEqual(resultNull);
  });

  it('should use defaults for non-object config', () => {
    const result = validateConfiguration('not an object');

    expect(result.defaultQuickAddDictionary).toBe('properNouns');
    expect(result.theme).toBe('system');
  });

  it('should validate individual fields and use defaults for invalid ones', () => {
    const config = {
      defaultQuickAddDictionary: 123, // Invalid type
      theme: 'invalid-theme', // Invalid value
      fontSize: 100, // Out of range
      autoSave: 'yes', // Invalid type
    };

    const result = validateConfiguration(config);

    // All should fall back to defaults due to validation failures
    expect(result.defaultQuickAddDictionary).toBe('properNouns');
    expect(result.theme).toBe('system');
    expect(result.fontSize).toBe(14);
    expect(result.autoSave).toBe(true);
  });

  it('should accept valid theme values', () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

    for (const theme of themes) {
      const config = { theme };
      const result = validateConfiguration(config);
      expect(result.theme).toBe(theme);
    }
  });

  it('should accept valid fontSize range', () => {
    const validSizes = [8, 12, 14, 16, 20, 24, 32];

    for (const size of validSizes) {
      const config = { fontSize: size };
      const result = validateConfiguration(config);
      expect(result.fontSize).toBe(size);
    }
  });

  it('should reject fontSize outside range', () => {
    const invalidSizes = [7, 33, 0, -10, 100];

    for (const size of invalidSizes) {
      const config = { fontSize: size };
      const result = validateConfiguration(config);
      expect(result.fontSize).toBe(14); // Default
    }
  });

  it('should preserve extra properties in raw field', () => {
    const config = {
      defaultQuickAddDictionary: 'test',
      customField: 'custom value',
      anotherField: 123,
    };

    const result = validateConfiguration(config);

    expect(result.raw).toHaveProperty('customField', 'custom value');
    expect(result.raw).toHaveProperty('anotherField', 123);
  });
});

describe('validateDictionaryEntry', () => {
  it('should validate simple string entry', () => {
    const entry = 'Vietnamese translation';
    const result = validateDictionaryEntry(entry, '中文');

    expect(result).toBe('Vietnamese translation');
  });

  it('should validate complex entry with metadata', () => {
    const entry = {
      translation: 'Vietnamese translation',
      metadata: {
        priority: 10,
        lowPriority: false,
        isVariable: true,
      },
    };

    const result = validateDictionaryEntry(entry, '中文');

    expect(result).toEqual(entry);
  });

  it('should return null for missing translation field', () => {
    const entry = {
      metadata: { priority: 10 },
      // Missing translation
    };

    const result = validateDictionaryEntry(entry, '中文');

    expect(result).toBeNull();
  });

  it('should validate metadata fields and skip invalid ones', () => {
    const entry = {
      translation: 'Vietnamese translation',
      metadata: {
        priority: 'not a number', // Invalid
        lowPriority: true, // Valid
        isVariable: 'yes', // Invalid
      },
    };

    const result = validateDictionaryEntry(entry, '中文');

    expect(result).toEqual({
      translation: 'Vietnamese translation',
      metadata: {
        lowPriority: true, // Only valid field preserved
      },
    });
  });

  it('should preserve unknown metadata fields for extensibility', () => {
    const entry = {
      translation: 'Vietnamese translation',
      metadata: {
        priority: 10,
        customField: 'custom value',
        anotherField: 123,
      },
    };

    const result = validateDictionaryEntry(entry, '中文');

    expect(result).toHaveProperty('metadata');
    const metadata = (result as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toHaveProperty('customField', 'custom value');
    expect(metadata).toHaveProperty('anotherField', 123);
  });

  it('should return null for null/undefined entries', () => {
    expect(validateDictionaryEntry(null, '中文')).toBeNull();
    expect(validateDictionaryEntry(undefined, '中文')).toBeNull();
  });

  it('should return null for invalid types', () => {
    expect(validateDictionaryEntry(123, '中文')).toBeNull();
    expect(validateDictionaryEntry(true, '中文')).toBeNull();
    expect(validateDictionaryEntry([], '中文')).toBeNull();
  });
});

describe('validateDictionary', () => {
  it('should validate complete dictionary', () => {
    const dict = {
      中文: 'tiếng Trung',
      你好: 'xin chào',
      谢谢: {
        translation: 'cảm ơn',
        metadata: { priority: 10 },
      },
    };

    const result = validateDictionary(dict, 'test-dict');

    expect(Object.keys(result)).toHaveLength(3);
    expect(result['中文']).toBe('tiếng Trung');
    expect(result['你好']).toBe('xin chào');
    expect(result['谢谢']).toEqual({
      translation: 'cảm ơn',
      metadata: { priority: 10 },
    });
  });

  it('should return empty object for non-object input', () => {
    expect(validateDictionary(null, 'test-dict')).toEqual({});
    expect(validateDictionary(undefined, 'test-dict')).toEqual({});
    expect(validateDictionary('not an object', 'test-dict')).toEqual({});
    expect(validateDictionary(123, 'test-dict')).toEqual({});
  });

  it('should skip entries with invalid source keys', () => {
    const dict = {
      '': 'should be skipped', // Empty string
      ' ': 'should be skipped', // Whitespace only
      '  ': 'should be skipped',
      中文: 'should be kept',
    };

    const result = validateDictionary(dict, 'test-dict');

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['中文']).toBe('should be kept');
  });

  it('should skip entries with invalid values', () => {
    const dict = {
      中文: 'valid entry',
      你好: null, // Invalid
      谢谢: undefined, // Invalid
      再见: 123, // Invalid type
      早上好: {
        // Missing translation
        metadata: { priority: 10 },
      },
    };

    const result = validateDictionary(dict, 'test-dict');

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['中文']).toBe('valid entry');
  });

  it('should handle mixed valid and invalid entries', () => {
    const dict = {
      valid1: 'translation 1',
      invalid1: null,
      valid2: { translation: 'translation 2' },
      invalid2: { metadata: 'no translation' },
      valid3: 'translation 3',
    };

    const result = validateDictionary(dict, 'test-dict');

    expect(Object.keys(result)).toHaveLength(3);
    expect(result.valid1).toBe('translation 1');
    expect(result.valid2).toEqual({ translation: 'translation 2' });
    expect(result.valid3).toBe('translation 3');
  });
});

describe('validateDictionaryList', () => {
  it('should validate array of string IDs', () => {
    const list = ['properNouns', 'properNouns-Novel1', 'characters'];
    const result = validateDictionaryList(list);

    expect(result).toEqual(list);
  });

  it('should return empty array for non-array input', () => {
    expect(validateDictionaryList(null)).toEqual([]);
    expect(validateDictionaryList(undefined)).toEqual([]);
    expect(validateDictionaryList('not an array')).toEqual([]);
    expect(validateDictionaryList({ test: 'object' })).toEqual([]);
  });

  it('should filter out non-string entries', () => {
    const list = ['valid1', 123, 'valid2', null, 'valid3', undefined, true];
    const result = validateDictionaryList(list);

    expect(result).toEqual(['valid1', 'valid2', 'valid3']);
  });

  it('should filter out empty/whitespace strings', () => {
    const list = ['valid1', '', 'valid2', ' ', 'valid3', '  '];
    const result = validateDictionaryList(list);

    expect(result).toEqual(['valid1', 'valid2', 'valid3']);
  });

  it('should handle empty array', () => {
    const result = validateDictionaryList([]);
    expect(result).toEqual([]);
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

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ValidationError');
    expect(error instanceof Error).toBe(true);
  });

  it('should include field and value in error', () => {
    const error = new ValidationError('Invalid field', 'testField', 123);

    expect(error.message).toBe('Invalid field');
    expect(error.field).toBe('testField');
    expect(error.value).toBe(123);
  });
});

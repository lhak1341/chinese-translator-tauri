/**
 * Tests for Unicode Punctuation Detection System
 */

import { UnicodePunctuationDetector } from '../UnicodePunctuationDetector.js';
import { TextChunker } from '../TextChunker.js';

describe('UnicodePunctuationDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new UnicodePunctuationDetector();
  });

  test('should detect basic punctuation', () => {
    expect(detector.isPunctuationSeparator('.')).toBe(true);
    expect(detector.isPunctuationSeparator(',')).toBe(true);
    expect(detector.isPunctuationSeparator('!')).toBe(true);
    expect(detector.isPunctuationSeparator('?')).toBe(true);
  });

  test('should detect Chinese punctuation', () => {
    expect(detector.isPunctuationSeparator('。')).toBe(true);
    expect(detector.isPunctuationSeparator('，')).toBe(true);
    expect(detector.isPunctuationSeparator('！')).toBe(true);
    expect(detector.isPunctuationSeparator('？')).toBe(true);
    expect(detector.isPunctuationSeparator('；')).toBe(true);
    expect(detector.isPunctuationSeparator('：')).toBe(true);
  });

  test('should detect brackets and quotes', () => {
    expect(detector.isPunctuationSeparator('(')).toBe(true);
    expect(detector.isPunctuationSeparator(')')).toBe(true);
    expect(detector.isPunctuationSeparator('（')).toBe(true);
    expect(detector.isPunctuationSeparator('）')).toBe(true);
    expect(detector.isPunctuationSeparator('【')).toBe(true);
    expect(detector.isPunctuationSeparator('】')).toBe(true);
    expect(detector.isPunctuationSeparator('《')).toBe(true);
    expect(detector.isPunctuationSeparator('》')).toBe(true);
  });

  test('should not detect regular letters as punctuation', () => {
    expect(detector.isPunctuationSeparator('a')).toBe(false);
    expect(detector.isPunctuationSeparator('中')).toBe(false);
    expect(detector.isPunctuationSeparator('1')).toBe(false);
    expect(detector.isPunctuationSeparator(' ')).toBe(false);
  });

  test('should respect excluded characters', () => {
    const customDetector = new UnicodePunctuationDetector({
      excludedCharacters: new Set(['.', '，'])
    });
    
    expect(customDetector.isPunctuationSeparator('.')).toBe(false);
    expect(customDetector.isPunctuationSeparator('，')).toBe(false);
    expect(customDetector.isPunctuationSeparator('!')).toBe(true); // Still enabled
  });

  test('should respect included characters', () => {
    const customDetector = new UnicodePunctuationDetector({
      includedCharacters: new Set(['-', '_'])
    });
    
    expect(customDetector.isPunctuationSeparator('-')).toBe(true);
    expect(customDetector.isPunctuationSeparator('_')).toBe(true);
  });

  test('should provide character information', () => {
    const info = detector.getCharacterInfo('。');
    expect(info.character).toBe('。');
    expect(info.isSeparator).toBe(true);
    expect(typeof info.codePoint).toBe('number');
    expect(typeof info.hexCode).toBe('string');
  });

  test('should find all separators in text', () => {
    const text = 'Hello, world! 你好，世界！';
    const separators = detector.findAllSeparators(text);
    expect(separators).toContain(',');
    expect(separators).toContain('!');
    expect(separators).toContain('，');
    expect(separators).toContain('！');
  });
});

describe('TextChunker with Unicode Punctuation', () => {
  test('should chunk text using Unicode punctuation detection', () => {
    const chunker = new TextChunker();
    const text = 'Hello, world! 你好，世界！How are you?';
    const chunks = chunker.chunkText(text);
    
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[0].punctuation).toBe(',');
  });

  test('should provide diagnostic information', () => {
    const chunker = new TextChunker();
    const diagnostics = chunker.getDiagnosticInfo();
    
    expect(typeof diagnostics.supportsUnicodeProperties).toBe('boolean');
    expect(typeof diagnostics.enabledCategories).toBe('object');
    expect(typeof diagnostics.customSeparatorCount).toBe('number');
  });

  test('should allow configuration updates', () => {
    const chunker = new TextChunker();
    
    // Test that we can update configuration
    chunker.updatePunctuationConfig({
      excludedCharacters: new Set(['.'])
    });
    
    expect(chunker.isPunctuationSeparator('.')).toBe(false);
    expect(chunker.isPunctuationSeparator(',')).toBe(true);
  });
});

describe('Unicode Category Support', () => {
  test('should provide category information', () => {
    const categories = UnicodePunctuationDetector.getSupportedCategories();
    expect(categories).toBeInstanceOf(Array);
    expect(categories.length).toBeGreaterThan(0);
    
    const poCategory = categories.find(cat => cat.code === 'Po');
    expect(poCategory).toBeDefined();
    expect(poCategory.name).toBe('Other Punctuation');
  });
});
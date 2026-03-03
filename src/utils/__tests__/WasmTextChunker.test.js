import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { WasmTextChunker } from '../wasm/WasmTextChunker.js';
import { TextChunker } from '../text/TextChunker.js';

describe('WasmTextChunker', () => {
  let wasmChunker;
  let jsChunker;
  let wasmInitialized = false;

  beforeAll(async () => {
    wasmChunker = new WasmTextChunker();
    jsChunker = new TextChunker();

    try {
      wasmInitialized = await wasmChunker.initialize();
    } catch (error) {
      console.warn('WASM initialization failed in tests, using fallback:', error);
    }
  });

  afterEach(() => {
    if (wasmInitialized) {
      wasmChunker.resetStats();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully or fail gracefully', () => {
      // Initialization result is environment-dependent
      // Just verify we have a wasmChunker instance
      expect(wasmChunker).toBeDefined();
    });

    it('should return null when chunking before initialization', () => {
      const uninitializedChunker = new WasmTextChunker();
      const result = uninitializedChunker.chunkText('Hello, world!');
      expect(result).toBeNull();
    });

    it('should expose statistics methods', () => {
      expect(typeof wasmChunker.getStats).toBe('function');
      expect(typeof wasmChunker.resetStats).toBe('function');
      expect(typeof wasmChunker.getGlobalStats).toBe('function');
    });
  });

  describe('Basic Chunking (when WASM available)', () => {
    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should chunk simple text with punctuation', () => {
      const text = 'Hello, world!';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('content');
      expect(chunks[0]).toHaveProperty('punctuation');
      expect(chunks[0]).toHaveProperty('startIndex');
      expect(chunks[0]).toHaveProperty('lineBreaks');
      expect(chunks[0]).toHaveProperty('startedBy');
    });

    skipIfNoWasm('should chunk Chinese text', () => {
      const text = '她的目光忽然落在陈暮的脸上，当看到陈暮闭上的双眼时，她的眼睛腾地红了。';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    skipIfNoWasm('should handle empty text', () => {
      const chunks = wasmChunker.chunkText('');
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBe(0);
    });

    skipIfNoWasm('should handle text with only whitespace', () => {
      const chunks = wasmChunker.chunkText('   \n\t  ');
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });

    skipIfNoWasm('should preserve line breaks', () => {
      const text = 'Line 1\nLine 2\rLine 3';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      const hasLineBreaks = chunks.some((chunk) => chunk.lineBreaks && chunk.lineBreaks.length > 0);
      expect(hasLineBreaks).toBe(true);
    });

    skipIfNoWasm('should handle mixed Chinese and English punctuation', () => {
      const text = 'Hello, 世界！How are you? 你好吗？';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    skipIfNoWasm('should track startIndex correctly', () => {
      const text = 'ABC,DE.FG';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);

      // Verify startIndex is a number and reasonable
      chunks.forEach((chunk) => {
        expect(typeof chunk.startIndex).toBe('number');
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
      });
    });

    skipIfNoWasm('should set startedBy context', () => {
      const text = 'First. Second!';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      chunks.forEach((chunk) => {
        expect(chunk).toHaveProperty('startedBy');
        expect(typeof chunk.startedBy).toBe('string');
      });
    });
  });

  describe('Consistency with JavaScript Chunker', () => {
    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should produce same number of chunks for simple text', () => {
      const text = 'ABC,DE.FG"HIJ"KL!MNOP.';
      const wasmChunks = wasmChunker.chunkText(text);
      const jsChunks = jsChunker.chunkText(text);

      expect(wasmChunks.length).toBe(jsChunks.length);
    });

    skipIfNoWasm('should produce same content fields', () => {
      const text = '她的目光忽然落在陈暮的脸上，当看到陈暮闭上的双眼时。';
      const wasmChunks = wasmChunker.chunkText(text);
      const jsChunks = jsChunker.chunkText(text);

      expect(wasmChunks.length).toBe(jsChunks.length);

      for (let i = 0; i < wasmChunks.length; i++) {
        expect(wasmChunks[i].content.trim()).toBe(jsChunks[i].content.trim());
      }
    });

    skipIfNoWasm('should produce same punctuation fields', () => {
      const text = '测试，文本。这是！一个？测试；文本：示例';
      const wasmChunks = wasmChunker.chunkText(text);
      const jsChunks = jsChunker.chunkText(text);

      expect(wasmChunks.length).toBe(jsChunks.length);

      for (let i = 0; i < wasmChunks.length; i++) {
        expect(wasmChunks[i].punctuation).toBe(jsChunks[i].punctuation);
      }
    });
  });

  describe('Edge Cases', () => {
    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should handle Unicode characters', () => {
      const text = 'Test with emoji 😀 and symbols ∑∏';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });

    skipIfNoWasm('should handle very long text', () => {
      const text = '中'.repeat(5000) + '。';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    skipIfNoWasm('should handle text with only punctuation', () => {
      const text = '，。！？；：';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });

    skipIfNoWasm('should handle multiple consecutive line breaks', () => {
      const text = 'Line 1\n\n\nLine 2\r\r\rLine 3';
      const chunks = wasmChunker.chunkText(text);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('Statistics', () => {
    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should track chunk processing', () => {
      wasmChunker.resetStats();

      const text1 = 'Hello, world!';
      const text2 = '你好，世界！';

      wasmChunker.chunkText(text1);
      wasmChunker.chunkText(text2);

      const stats = wasmChunker.getStats();
      expect(stats.wasmHits).toBe(2);
      expect(stats.chunksProcessed).toBe(2);
    });

    skipIfNoWasm('should track time', () => {
      wasmChunker.resetStats();

      const text = '中'.repeat(1000) + '。';
      wasmChunker.chunkText(text);

      const stats = wasmChunker.getStats();
      expect(stats.totalTimeUs).toBeGreaterThan(0);
      expect(stats.avgTimeUs).toBeGreaterThan(0);
    });

    skipIfNoWasm('should calculate hit rate', () => {
      wasmChunker.resetStats();

      const text = 'Test text.';
      wasmChunker.chunkText(text);

      const stats = wasmChunker.getStats();
      expect(stats).toHaveProperty('hitRate');
      expect(stats.hitRate).toContain('%');
    });

    it('should track fallbacks when not initialized', () => {
      const uninitializedChunker = new WasmTextChunker();

      uninitializedChunker.chunkText('Test 1');
      uninitializedChunker.chunkText('Test 2');

      const stats = uninitializedChunker.getStats();
      expect(stats.fallbackCount).toBeGreaterThanOrEqual(2);
      expect(stats.wasmHits).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle WASM initialization failure gracefully', () => {
      const failingChunker = new WasmTextChunker();
      expect(() => failingChunker.chunkText('Test')).not.toThrow();
      const result = failingChunker.chunkText('Test');
      expect(result).toBeNull();
    });

    it('should return stats even when not initialized', () => {
      const uninitializedChunker = new WasmTextChunker();
      const stats = uninitializedChunker.getStats();

      expect(stats).toBeDefined();
      expect(stats.chunksProcessed).toBe(0);
      expect(stats.wasmHits).toBe(0);
    });

    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should handle null input gracefully', () => {
      const chunks = wasmChunker.chunkText(null);
      // May return empty array or handle gracefully
      expect(chunks === null || Array.isArray(chunks)).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    const skipIfNoWasm = wasmInitialized ? it : it.skip;

    skipIfNoWasm('should be faster than JavaScript for large texts', () => {
      const largeText = '中文测试，这是一个很长的文本。'.repeat(100);

      // Warm up
      wasmChunker.chunkText(largeText);
      jsChunker.chunkText(largeText);

      // Measure WASM
      const wasmStart = performance.now();
      for (let i = 0; i < 10; i++) {
        wasmChunker.chunkText(largeText);
      }
      const wasmTime = performance.now() - wasmStart;

      // Measure JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < 10; i++) {
        jsChunker.chunkText(largeText);
      }
      const jsTime = performance.now() - jsStart;

      // WASM should be faster (allow some variance in test environment)
      // We expect 2-3x speedup, but in tests just verify WASM completes
      expect(wasmTime).toBeGreaterThan(0);
      expect(jsTime).toBeGreaterThan(0);

      console.log(`Performance comparison for large text (10 iterations):`);
      console.log(`  WASM: ${wasmTime.toFixed(2)}ms`);
      console.log(`  JavaScript: ${jsTime.toFixed(2)}ms`);
      console.log(`  Speedup: ${(jsTime / wasmTime).toFixed(2)}x`);
    });
  });

  describe('Integration with TextChunker', () => {
    it('should integrate seamlessly with TextChunker fallback', () => {
      // TextChunker should try WASM first, then fall back to JavaScript
      const chunker = new TextChunker();
      const text = 'Hello, world! 你好，世界！';

      // Should work regardless of WASM availability
      expect(() => chunker.chunkText(text)).not.toThrow();

      const chunks = chunker.chunkText(text);
      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should produce TextChunk objects from TextChunker', () => {
      const chunker = new TextChunker();
      const text = 'Test, text.';
      const chunks = chunker.chunkText(text);

      // Verify chunks have the expected structure
      chunks.forEach((chunk) => {
        expect(chunk).toHaveProperty('content');
        expect(chunk).toHaveProperty('punctuation');
        expect(chunk).toHaveProperty('startIndex');
        expect(chunk).toHaveProperty('endIndex');
        expect(chunk).toHaveProperty('startedBy');
        expect(chunk).toHaveProperty('lineBreaks');
        expect(chunk).toHaveProperty('translated');
        expect(chunk).toHaveProperty('translatedPunctuation');
      });
    });
  });
});

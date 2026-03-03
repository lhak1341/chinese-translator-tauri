import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WasmDictionaryTrieWrapper } from '../wasm/WasmDictionaryTrie.js';
import {
  tokenPositionToCharPosition,
  charLengthToTokenCount,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
} from '../highlighting/PositionMappingUtils.js';

/**
 * WASM Dictionary Trie Validation Tests
 *
 * Phase 3: Integration Validation
 * Compares WASM vs JavaScript implementations for correctness and performance
 *
 * Test Strategy:
 * 1. Build test dictionary with known entries
 * 2. Run lookups through both WASM and JavaScript paths
 * 3. Compare results byte-by-byte
 * 4. Measure performance differences
 */

describe.skip('WASM Dictionary Trie Validation', () => {
  // NOTE: These tests require browser environment with WASM support
  // Run manually in development mode: npm run tauri:dev
  // Then open DevTools console and run validation tests

  let wasmTrie = null;
  let jsDictionary = null;

  // Test dictionary with various entry types
  const testEntries = [
    // Single characters
    { chars: '我', translation: 'tôi', priority: 5 },
    { chars: '你', translation: 'bạn', priority: 5 },
    { chars: '他', translation: 'anh ấy', priority: 5 },
    { chars: '她', translation: 'cô ấy', priority: 5 },
    { chars: '它', translation: 'nó', priority: 5 },

    // Two-character words
    { chars: '今天', translation: 'hôm nay', priority: 7 },
    { chars: '明天', translation: 'ngày mai', priority: 7 },
    { chars: '昨天', translation: 'hôm qua', priority: 7 },
    { chars: '天气', translation: 'thời tiết', priority: 7 },
    { chars: '学习', translation: 'học tập', priority: 7 },

    // Three-character phrases
    { chars: '不知道', translation: 'không biết', priority: 8 },
    { chars: '怎么样', translation: 'thế nào', priority: 8 },
    { chars: '为什么', translation: 'tại sao', priority: 8 },

    // Four-character phrases
    { chars: '非常感谢', translation: 'cảm ơn rất nhiều', priority: 9 },
    { chars: '不客气了', translation: 'không khách khí', priority: 9 },

    // Overlapping entries (test longest match)
    { chars: '好', translation: 'tốt', priority: 5 },
    { chars: '好的', translation: 'được', priority: 6 },
    { chars: '好好学习', translation: 'học tập chăm chỉ', priority: 8 },

    // Numbers and special characters
    { chars: '一', translation: 'một', priority: 5 },
    { chars: '二', translation: 'hai', priority: 5 },
    { chars: '三', translation: 'ba', priority: 5 },
  ];

  beforeAll(async () => {
    // Initialize WASM trie
    wasmTrie = new WasmDictionaryTrieWrapper('test-characters');
    const initSuccess = await wasmTrie.initialize();
    expect(initSuccess).toBe(true);

    const loadSuccess = await wasmTrie.loadEntries(testEntries);
    expect(loadSuccess).toBe(true);

    // Build JavaScript Map dictionary
    jsDictionary = new Map();
    testEntries.forEach((entry) => {
      jsDictionary.set(entry.chars, entry.translation);
    });
  });

  afterAll(() => {
    if (wasmTrie) {
      wasmTrie.clear();
    }
  });

  describe('Correctness Validation', () => {
    describe('Single character lookups', () => {
      it('should match WASM and JavaScript for "我"', () => {
        const text = '我';
        const tokens = [{ value: '我' }];

        // WASM lookup
        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        const wasmResult = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'characters');

        // JavaScript lookup
        const jsResult = jsDictionary.get('我');

        expect(wasmResult).not.toBeNull();
        expect(wasmResult.translation).toBe(jsResult);
        expect(wasmResult.word).toBe('我');
        expect(wasmResult.tokenLength).toBe(1);
      });

      it('should match WASM and JavaScript for all single characters', () => {
        const singleChars = testEntries.filter((e) => e.chars.length === 1);

        singleChars.forEach(({ chars, translation }) => {
          const tokens = [{ value: chars }];
          const text = buildFullTextFromTokens(tokens);

          // WASM
          const wasmMatch = wasmTrie.findLongestMatch(text, 0);
          const wasmResult = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'characters');

          // JavaScript
          const jsResult = jsDictionary.get(chars);

          expect(wasmResult.translation).toBe(jsResult);
          expect(wasmResult.translation).toBe(translation);
        });
      });
    });

    describe('Multi-character lookups', () => {
      it('should match WASM and JavaScript for "今天"', () => {
        const tokens = [{ value: '今天' }];
        const text = buildFullTextFromTokens(tokens);

        // WASM
        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        const wasmResult = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'characters');

        // JavaScript
        const jsResult = jsDictionary.get('今天');

        expect(wasmResult.translation).toBe(jsResult);
        expect(wasmResult.translation).toBe('hôm nay');
        expect(wasmResult.tokenLength).toBe(1); // 2 chars in 1 token
      });

      it('should match for all multi-character entries', () => {
        const multiChars = testEntries.filter((e) => e.chars.length > 1);

        multiChars.forEach(({ chars, translation }) => {
          const tokens = [{ value: chars }];
          const text = buildFullTextFromTokens(tokens);

          // WASM
          const wasmMatch = wasmTrie.findLongestMatch(text, 0);
          const wasmResult = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'characters');

          // JavaScript
          const jsResult = jsDictionary.get(chars);

          expect(wasmResult.translation).toBe(jsResult);
          expect(wasmResult.translation).toBe(translation);
        });
      });
    });

    describe('Longest match selection', () => {
      it('should prefer "好好学习" over "好" and "好的"', () => {
        const tokens = [{ value: '好' }, { value: '好' }, { value: '学' }, { value: '习' }];
        const text = buildFullTextFromTokens(tokens);

        // WASM should find longest match
        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch.matchedText).toBe('好好学习');
        expect(wasmMatch.translation).toBe('học tập chăm chỉ');
      });

      it('should prefer "好的" over "好" when applicable', () => {
        const tokens = [{ value: '好' }, { value: '的' }];
        const text = buildFullTextFromTokens(tokens);

        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch.matchedText).toBe('好的');
        expect(wasmMatch.translation).toBe('được');
      });

      it('should fallback to "好" when no longer match available', () => {
        const tokens = [{ value: '好' }, { value: '吗' }]; // "吗" not in dictionary
        const text = buildFullTextFromTokens(tokens);

        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch.matchedText).toBe('好');
        expect(wasmMatch.translation).toBe('tốt');
      });
    });

    describe('Position mapping accuracy', () => {
      it('should handle lookups at different token positions', () => {
        const tokens = [{ value: '我' }, { value: '今天' }, { value: '学习' }, { value: '不知道' }];
        const text = buildFullTextFromTokens(tokens);

        // Position 0: "我"
        const pos0 = tokenPositionToCharPosition(tokens, 0);
        expect(pos0).toBe(0);
        const match0 = wasmTrie.findLongestMatch(text, pos0);
        expect(match0.matchedText).toBe('我');

        // Position 1: "今天"
        const pos1 = tokenPositionToCharPosition(tokens, 1);
        expect(pos1).toBe(1); // Skip "我"
        const match1 = wasmTrie.findLongestMatch(text, pos1);
        expect(match1.matchedText).toBe('今天');

        // Position 2: "学习"
        const pos2 = tokenPositionToCharPosition(tokens, 2);
        expect(pos2).toBe(3); // Skip "我今天"
        const match2 = wasmTrie.findLongestMatch(text, pos2);
        expect(match2.matchedText).toBe('学习');

        // Position 3: "不知道"
        const pos3 = tokenPositionToCharPosition(tokens, 3);
        expect(pos3).toBe(5); // Skip "我今天学习"
        const match3 = wasmTrie.findLongestMatch(text, pos3);
        expect(match3.matchedText).toBe('不知道');
      });

      it('should correctly convert character length to token count', () => {
        const tokens = [{ value: '今天' }, { value: '天气' }, { value: '好' }];

        // "今天" = 2 chars = 1 token
        expect(charLengthToTokenCount(tokens, 0, 2)).toBe(1);

        // "今天天气" = 4 chars = 2 tokens
        expect(charLengthToTokenCount(tokens, 0, 4)).toBe(2);

        // "今天天气好" = 5 chars = 3 tokens
        expect(charLengthToTokenCount(tokens, 0, 5)).toBe(3);

        // From position 1: "天气" = 2 chars = 1 token
        expect(charLengthToTokenCount(tokens, 1, 2)).toBe(1);
      });
    });

    describe('No match scenarios', () => {
      it('should return null for characters not in dictionary', () => {
        const text = 'ABC'; // Not Chinese
        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch).toBeNull();
      });

      it('should return null for position beyond text', () => {
        const text = '我';
        const wasmMatch = wasmTrie.findLongestMatch(text, 10);
        expect(wasmMatch).toBeNull();
      });

      it('should return null for unknown Chinese characters', () => {
        const text = '龘'; // Rare character not in dictionary
        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch).toBeNull();
      });
    });

    describe('Unicode edge cases', () => {
      it('should handle emoji characters correctly', async () => {
        // Add emoji to dictionary
        const emojiEntries = [{ chars: '😀', translation: 'mặt cười', priority: 5 }];
        await wasmTrie.loadEntries([...testEntries, ...emojiEntries]);

        const tokens = [{ value: '😀' }]; // Emoji = 2 UTF-16 code units
        const text = buildFullTextFromTokens(tokens);

        const wasmMatch = wasmTrie.findLongestMatch(text, 0);
        expect(wasmMatch).not.toBeNull();
        expect(wasmMatch.matchedText).toBe('😀');
      });

      it('should handle mixed Chinese and emoji', async () => {
        const tokens = [{ value: '我' }, { value: '😀' }, { value: '你' }];
        const text = buildFullTextFromTokens(tokens);

        // Position 0: "我"
        const match0 = wasmTrie.findLongestMatch(text, 0);
        expect(match0.matchedText).toBe('我');

        // Position 2 (after emoji's 2 code units): "你"
        const pos2 = tokenPositionToCharPosition(tokens, 2);
        const match2 = wasmTrie.findLongestMatch(text, pos2);
        expect(match2.matchedText).toBe('你');
      });
    });
  });

  describe('Performance Validation', () => {
    describe('Lookup speed comparison', () => {
      it('should measure WASM vs JavaScript lookup time', () => {
        const iterations = 1000;
        const testText = '我今天学习不知道';
        const tokens = testText.split('').map((char) => ({ value: char }));
        const fullText = buildFullTextFromTokens(tokens);

        // Warm up both implementations
        for (let i = 0; i < 10; i++) {
          wasmTrie.findLongestMatch(fullText, 0);
          jsDictionary.get('我');
        }

        // Benchmark WASM
        const wasmStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          wasmTrie.findLongestMatch(fullText, 0);
        }
        const wasmTime = performance.now() - wasmStart;

        // Benchmark JavaScript (simulate findLongestMatchAtPosition logic)
        const jsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          let found = false;
          for (let length = 1; length <= 10 && !found; length++) {
            const text = tokens
              .slice(0, length)
              .map((t) => t.value)
              .join('');
            if (jsDictionary.has(text)) {
              found = true;
            }
          }
        }
        const jsTime = performance.now() - jsStart;

        const speedup = jsTime / wasmTime;

        console.log(`\n📊 Lookup Performance (${iterations} iterations):`);
        console.log(`   WASM: ${wasmTime.toFixed(2)}ms`);
        console.log(`   JavaScript: ${jsTime.toFixed(2)}ms`);
        console.log(`   Speedup: ${speedup.toFixed(2)}x`);

        // WASM should be faster (but we don't enforce specific ratio in test)
        expect(wasmTime).toBeGreaterThan(0);
        expect(jsTime).toBeGreaterThan(0);
      });

      it('should measure position mapping overhead', () => {
        const iterations = 10000;
        const tokens = [{ value: '我' }, { value: '今天' }, { value: '学习' }, { value: '不知道' }];

        // Benchmark position mapping
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          tokenPositionToCharPosition(tokens, 2);
          charLengthToTokenCount(tokens, 0, 3);
          buildFullTextFromTokens(tokens);
        }
        const mappingTime = performance.now() - start;

        console.log(`\n📊 Position Mapping Overhead (${iterations} iterations):`);
        console.log(`   Total: ${mappingTime.toFixed(2)}ms`);
        console.log(`   Per call: ${(mappingTime / iterations).toFixed(4)}ms`);

        // Should be very fast (< 1ms per call for 4 tokens)
        expect(mappingTime / iterations).toBeLessThan(1);
      });
    });

    describe('Memory usage', () => {
      it('should report WASM trie statistics', () => {
        const stats = wasmTrie.getStats();

        console.log('\n📊 WASM Trie Statistics:');
        console.log(`   Entries: ${stats.entryCount}`);
        console.log(`   Nodes: ${stats.nodeCount}`);
        console.log(`   Max Depth: ${stats.maxDepth}`);

        expect(stats.entryCount).toBeGreaterThan(0);
        expect(stats.nodeCount).toBeGreaterThan(0);
        expect(stats.maxDepth).toBeGreaterThan(0);
      });
    });
  });

  describe('Batch lookup validation', () => {
    it('should match WASM and JavaScript for 100+ lookups', () => {
      // Generate test sentences
      const testSentences = [
        '我今天学习',
        '明天天气好',
        '昨天不知道',
        '怎么样学习',
        '为什么今天',
        '非常感谢你',
        '好好学习天天',
        '我不知道怎么样',
        '今天明天昨天',
        '学习学习学习',
      ];

      let matchCount = 0;
      let mismatchCount = 0;

      testSentences.forEach((sentence) => {
        const tokens = sentence.split('').map((char) => ({ value: char }));
        const text = buildFullTextFromTokens(tokens);

        // Test each position
        for (let pos = 0; pos < tokens.length; pos++) {
          const charPos = tokenPositionToCharPosition(tokens, pos);

          // WASM lookup
          const wasmMatch = wasmTrie.findLongestMatch(text, charPos);

          // JavaScript lookup (simulate findLongestMatchAtPosition)
          let jsMatch = null;
          for (let length = 1; length <= Math.min(10, tokens.length - pos); length++) {
            const tokenSeq = tokens.slice(pos, pos + length);
            const lookupText = tokenSeq.map((t) => t.value).join('');
            const result = jsDictionary.get(lookupText);
            if (result && length > (jsMatch?.tokenLength || 0)) {
              jsMatch = {
                word: lookupText,
                translation: result,
                tokenLength: length,
              };
            }
          }

          // Compare results
          if (wasmMatch === null && jsMatch === null) {
            matchCount++;
          } else if (wasmMatch && jsMatch) {
            if (
              wasmMatch.matchedText === jsMatch.word &&
              wasmMatch.translation === jsMatch.translation
            ) {
              matchCount++;
            } else {
              mismatchCount++;
              console.error(`Mismatch at position ${pos} in "${sentence}":`);
              console.error(`  WASM: "${wasmMatch.matchedText}" -> "${wasmMatch.translation}"`);
              console.error(`  JS:   "${jsMatch.word}" -> "${jsMatch.translation}"`);
            }
          } else {
            mismatchCount++;
            console.error(`Result presence mismatch at position ${pos} in "${sentence}":`);
            console.error(`  WASM: ${wasmMatch ? 'found' : 'null'}`);
            console.error(`  JS:   ${jsMatch ? 'found' : 'null'}`);
          }
        }
      });

      console.log(`\n✅ Batch Validation Results:`);
      console.log(`   Matches: ${matchCount}`);
      console.log(`   Mismatches: ${mismatchCount}`);
      console.log(
        `   Accuracy: ${((matchCount / (matchCount + mismatchCount)) * 100).toFixed(2)}%`
      );

      // Should have 100% match rate
      expect(mismatchCount).toBe(0);
      expect(matchCount).toBeGreaterThan(0);
    });
  });
});

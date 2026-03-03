import { describe, it, expect } from 'vitest';
import {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
} from '../highlighting/PositionMappingUtils';

describe('PositionMappingUtils', () => {
  describe('tokenPositionToCharPosition', () => {
    it('should convert single-char tokens correctly', () => {
      const tokens = [{ value: '我' }, { value: '爱' }, { value: '你' }];

      expect(tokenPositionToCharPosition(tokens, 0)).toBe(0);
      expect(tokenPositionToCharPosition(tokens, 1)).toBe(1);
      expect(tokenPositionToCharPosition(tokens, 2)).toBe(2);
      expect(tokenPositionToCharPosition(tokens, 3)).toBe(3); // End position
    });

    it('should convert multi-char tokens correctly', () => {
      const tokens = [{ value: '今天' }, { value: '天气' }, { value: '好' }];

      expect(tokenPositionToCharPosition(tokens, 0)).toBe(0);
      expect(tokenPositionToCharPosition(tokens, 1)).toBe(2); // Skip "今天"
      expect(tokenPositionToCharPosition(tokens, 2)).toBe(4); // Skip "今天天气"
      expect(tokenPositionToCharPosition(tokens, 3)).toBe(5); // End position
    });

    it('should handle mixed single and multi-char tokens', () => {
      const tokens = [{ value: '我' }, { value: '今天' }, { value: '去' }, { value: '北京' }];

      expect(tokenPositionToCharPosition(tokens, 0)).toBe(0); // "我"
      expect(tokenPositionToCharPosition(tokens, 1)).toBe(1); // Skip "我"
      expect(tokenPositionToCharPosition(tokens, 2)).toBe(3); // Skip "我今天"
      expect(tokenPositionToCharPosition(tokens, 3)).toBe(4); // Skip "我今天去"
    });

    it('should handle empty tokens array', () => {
      expect(tokenPositionToCharPosition([], 0)).toBe(0);
    });

    it('should handle position at array start', () => {
      const tokens = [{ value: '测试' }];
      expect(tokenPositionToCharPosition(tokens, 0)).toBe(0);
    });

    it('should handle Unicode characters (emoji)', () => {
      const tokens = [{ value: '😀' }, { value: '你好' }, { value: '👋' }];

      expect(tokenPositionToCharPosition(tokens, 0)).toBe(0);
      expect(tokenPositionToCharPosition(tokens, 1)).toBe(2); // Emoji = 2 chars (surrogate pair)
      expect(tokenPositionToCharPosition(tokens, 2)).toBe(4); // Skip emoji + "你好"
    });

    it('should handle combining diacritical marks', () => {
      const tokens = [{ value: 'é' }, { value: '测试' }]; // é = e + combining acute

      const charPos = tokenPositionToCharPosition(tokens, 1);
      expect(charPos).toBeGreaterThan(0); // Should skip the combining chars
    });

    it('should throw on invalid input - non-array', () => {
      expect(() => tokenPositionToCharPosition(null, 0)).toThrow('tokens must be an array');
      expect(() => tokenPositionToCharPosition('string', 0)).toThrow('tokens must be an array');
    });

    it('should throw on invalid input - negative position', () => {
      const tokens = [{ value: '测试' }];
      expect(() => tokenPositionToCharPosition(tokens, -1)).toThrow(
        'tokenPos must be a non-negative integer'
      );
    });

    it('should throw on invalid input - non-integer position', () => {
      const tokens = [{ value: '测试' }];
      expect(() => tokenPositionToCharPosition(tokens, 1.5)).toThrow(
        'tokenPos must be a non-negative integer'
      );
    });

    it('should throw on invalid input - out of bounds', () => {
      const tokens = [{ value: '测试' }];
      expect(() => tokenPositionToCharPosition(tokens, 5)).toThrow('out of bounds');
    });

    it('should handle tokens with missing value field', () => {
      const tokens = [{ value: '测试' }, {}, { value: '好' }];

      // Should skip invalid token gracefully
      expect(tokenPositionToCharPosition(tokens, 2)).toBe(2);
    });
  });

  describe('buildFullTextFromTokens', () => {
    it('should build full text from single-char tokens', () => {
      const tokens = [{ value: '我' }, { value: '爱' }, { value: '你' }];
      expect(buildFullTextFromTokens(tokens)).toBe('我爱你');
    });

    it('should build full text from multi-char tokens', () => {
      const tokens = [{ value: '今天' }, { value: '天气' }, { value: '好' }];
      expect(buildFullTextFromTokens(tokens)).toBe('今天天气好');
    });

    it('should handle mixed tokens', () => {
      const tokens = [{ value: '我' }, { value: '今天' }, { value: '去' }, { value: '北京' }];
      expect(buildFullTextFromTokens(tokens)).toBe('我今天去北京');
    });

    it('should handle empty array', () => {
      expect(buildFullTextFromTokens([])).toBe('');
    });

    it('should handle tokens with missing value', () => {
      const tokens = [{ value: '测试' }, {}, { value: '好' }];
      expect(buildFullTextFromTokens(tokens)).toBe('测试好');
    });

    it('should handle Unicode characters', () => {
      const tokens = [{ value: '😀' }, { value: '你好' }, { value: '👋' }];
      expect(buildFullTextFromTokens(tokens)).toBe('😀你好👋');
    });

    it('should throw on invalid input', () => {
      expect(() => buildFullTextFromTokens(null)).toThrow('tokens must be an array');
    });
  });

  describe('convertWasmMatchToTokenMatch', () => {
    it('should convert WASM match to token match - single-char token', () => {
      const wasmMatch = {
        matchedText: '我',
        translation: 'tôi',
        length: 1,
        startPos: 0,
        endPos: 1,
        priority: 5,
        metadata: 'test',
      };

      const tokens = [{ value: '我' }, { value: '爱' }, { value: '你' }];

      const result = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'characters');

      expect(result).toEqual({
        word: '我',
        translation: 'tôi',
        tokenLength: 1,
        dictionary: 'characters',
        priority: 5,
        metadata: 'test',
      });
    });

    it('should convert WASM match to token match - multi-char token', () => {
      const wasmMatch = {
        matchedText: '今天',
        translation: 'hôm nay',
        length: 2,
        startPos: 0,
        endPos: 2,
        priority: 7,
      };

      const tokens = [{ value: '今天' }, { value: '天气' }];

      const result = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'phrases');

      expect(result).toEqual({
        word: '今天',
        translation: 'hôm nay',
        tokenLength: 1, // 2 chars = 1 token
        dictionary: 'phrases',
        priority: 7,
        metadata: undefined,
      });
    });

    it('should handle multi-token matches', () => {
      const wasmMatch = {
        matchedText: '我爱你',
        translation: 'tôi yêu bạn',
        length: 3,
        startPos: 0,
        endPos: 3,
      };

      const tokens = [{ value: '我' }, { value: '爱' }, { value: '你' }];

      const result = convertWasmMatchToTokenMatch(wasmMatch, tokens, 0, 'phrases');

      expect(result.tokenLength).toBe(3);
      expect(result.word).toBe('我爱你');
    });

    it('should handle null WASM match', () => {
      const tokens = [{ value: '测试' }];
      const result = convertWasmMatchToTokenMatch(null, tokens, 0, 'characters');
      expect(result).toBeNull();
    });

    it('should handle match starting from middle position', () => {
      const wasmMatch = {
        matchedText: '天气',
        translation: 'thời tiết',
        length: 2,
        startPos: 2,
        endPos: 4,
      };

      const tokens = [{ value: '今天' }, { value: '天气' }, { value: '好' }];

      const result = convertWasmMatchToTokenMatch(wasmMatch, tokens, 1, 'phrases');

      expect(result.tokenLength).toBe(1);
      expect(result.word).toBe('天气');
    });
  });

  describe('Integration tests', () => {
    it('should handle sequential lookups (Phase 5 pattern)', () => {
      const tokens = [
        { value: '今' },
        { value: '天' },
        { value: '天' },
        { value: '气' },
        { value: '好' },
      ];

      // Simulate Phase 5 sequential processing
      const fullText = buildFullTextFromTokens(tokens);
      expect(fullText).toBe('今天天气好');

      // Process token by token
      for (let tokenPos = 0; tokenPos < tokens.length; tokenPos++) {
        const charPos = tokenPositionToCharPosition(tokens, tokenPos);

        // Verify character at position matches token value
        const tokenValue = tokens[tokenPos].value;
        expect(fullText.substring(charPos, charPos + tokenValue.length)).toBe(tokenValue);
      }
    });

    it('should handle WASM integration workflow', () => {
      const tokens = [{ value: '我' }, { value: '爱' }, { value: '你' }];

      // Step 1: Build full text for WASM
      const fullText = buildFullTextFromTokens(tokens);
      expect(fullText).toBe('我爱你');

      // Step 2: Convert token position to char position
      const tokenPos = 1; // Token "爱"
      const charPos = tokenPositionToCharPosition(tokens, tokenPos);
      expect(charPos).toBe(1);

      // Step 3: Simulate WASM match at charPos
      const wasmMatch = {
        matchedText: '爱',
        translation: 'yêu',
        length: 1,
        startPos: charPos,
        endPos: charPos + 1,
      };

      // Step 4: Convert WASM result back to token format
      const tokenMatch = convertWasmMatchToTokenMatch(wasmMatch, tokens, tokenPos, 'characters');

      expect(tokenMatch).toEqual({
        word: '爱',
        translation: 'yêu',
        tokenLength: 1,
        dictionary: 'characters',
        priority: undefined,
        metadata: undefined,
      });
    });

    it('should handle multi-token WASM match workflow', () => {
      const tokens = [{ value: '今' }, { value: '天' }, { value: '天' }, { value: '气' }];

      // Build full text
      const fullText = buildFullTextFromTokens(tokens);
      expect(fullText).toBe('今天天气');

      // Token position 1 = "天"
      const tokenPos = 1;
      const charPos = tokenPositionToCharPosition(tokens, tokenPos);
      expect(charPos).toBe(1);

      // WASM finds "天天气" (3 chars, 3 tokens)
      const wasmMatch = {
        matchedText: '天天气',
        translation: 'thời tiết',
        length: 3,
        startPos: charPos,
        endPos: charPos + 3,
      };

      const tokenMatch = convertWasmMatchToTokenMatch(wasmMatch, tokens, tokenPos, 'phrases');

      expect(tokenMatch.tokenLength).toBe(3);
      expect(tokenMatch.word).toBe('天天气');
    });
  });
});

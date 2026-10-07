/**
 * Number Processor Tests
 *
 * What the processor converts, and to what, lives in test-fixtures/number-parity.json (run by
 * NumberProcessor.parity.test.js, and by the Rust spec in wasm-core/src/number_processor.rs).
 * This file keeps what the fixture cannot say: internal functions called directly, and token
 * input that is not plain text.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NumberProcessor } from '../NumberProcessor.js';

describe('NumberProcessor', () => {
  let processor;
  let mockOptions;

  beforeEach(() => {
    processor = new NumberProcessor();
    mockOptions = {
      semanticArrayBuilder: {
        addUnit: () => {},
      },
    };
  });

  /**
   * Helper to create token array from Chinese text
   */
  function createTokens(text) {
    return text.split('').map((char) => ({
      type: 'chinese_char',
      value: char,
      translated: null,
      translationSource: null,
    }));
  }

  describe('parseChineseNumber internal regex matches wasm-core parity', () => {
    // These call parseChineseNumber directly (not through processTokens) to prove the
    // INTERNAL hundreds/thousands regex itself — not just the top-level CONVERSION_PATTERNS
    // regex — now handles a bare 十-with-no-leading-digit remainder, matching
    // wasm-core/number_processor.rs's `(.*)` catch-all shape.
    it('parses 一百十五 (bare 十 remainder, no leading digit) → 115', () => {
      expect(processor.parseChineseNumber('一百十五')).toBe(115);
    });

    it('parses 一千十五 (bare 十 remainder, no leading digit) → 1015', () => {
      expect(processor.parseChineseNumber('一千十五')).toBe(1015);
    });

    it('parses 一千零十五 (零十 remainder branch) → 1015', () => {
      expect(processor.parseChineseNumber('一千零十五')).toBe(1015);
    });
  });

  describe('Number Ranges', () => {
    it('BUG FIX: tens-based range rejects a descending pair instead of "28-23"', () => {
      // 二十八三 (tens=2, units 8 then 3) has no ascending-order guard before this fix —
      // every sibling *Range converter validates ascending order except this one did.
      expect(processor.convertTensBasedRange('二十八三', '二', '八', '三')).toBeNull();
    });
  });

  describe('Token input that is not plain text', () => {
    it('does not modify already-translated tokens', () => {
      const tokens = createTokens('三十五');
      tokens[1].translated = 'already-translated';
      tokens[1].translationSource = 'test';

      processor.processTokens(tokens, mockOptions);

      expect(tokens[1].translated).toBe('already-translated');
      expect(tokens[1].translationSource).toBe('test');
    });

    it('handles empty token array', () => {
      const tokens = [];
      expect(() => processor.processTokens(tokens, mockOptions)).not.toThrow();
    });

    it('handles non-Chinese characters gracefully', () => {
      const tokens = [
        { type: 'punctuation', value: '。', translated: null, translationSource: null },
      ];
      expect(() => processor.processTokens(tokens, mockOptions)).not.toThrow();
    });
  });
});

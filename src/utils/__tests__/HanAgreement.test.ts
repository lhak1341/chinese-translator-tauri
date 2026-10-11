import { describe, expect, test } from 'vitest';

import { TextChunker } from '../text/TextChunker.js';
import { TextTokenizer, TokenType, containsHan } from '../text/TextTokenizer';

// The tokenizer types a character `chinese_char`; the chunker drops a chunk with no such
// character as untranslatable. They once held different range lists, so a chunk of only
// Extension A or Compatibility Han was typed Han by one and dropped by the other.
const BOUNDARIES = [
  0x33ff, 0x3400, 0x4dbf, 0x4dc0, 0x4dff, 0x4e00, 0x9fff, 0xa000, 0xf8ff, 0xf900, 0xfaff, 0xfb00,
];

describe('tokenizer and chunker agree on what is Han', () => {
  const tokenizer = new TextTokenizer();
  const chunker = new TextChunker();

  test.each(BOUNDARIES)('U+%s', (codePoint) => {
    const ch = String.fromCodePoint(codePoint);
    const isHanToken = tokenizer.tokenize(ch).some((t) => t.type === TokenType.CHINESE_CHAR);
    const kept = chunker.getTranslatableChunks(chunker.chunkText(ch)).length === 1;

    expect(containsHan(ch)).toBe(isHanToken);
    expect(kept).toBe(isHanToken);
  });

  test('Extension A and Compatibility chunks are kept', () => {
    for (const ch of ['㐀', '䶿', '豈', '﫿']) {
      expect(chunker.getTranslatableChunks(chunker.chunkText(ch))).toHaveLength(1);
    }
  });
});

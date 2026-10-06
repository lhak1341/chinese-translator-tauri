import { describe, test, expect, beforeEach } from 'vitest';

import { TextChunker } from '../text/TextChunker.js';

describe('TextChunker', () => {
  let chunker;

  beforeEach(() => {
    chunker = new TextChunker();
  });

  describe('core chunking behavior', () => {
    test('splits content and punctuation into separate fields', () => {
      const chunks = chunker.chunkText('Test, text.');
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toMatchObject({ content: 'Test', punctuation: ',', startedBy: 'start' });
      expect(chunks[1]).toMatchObject({ content: 'text', punctuation: '.', startedBy: ',' });
    });

    test('splits Chinese content on full-width punctuation', () => {
      const chunks = chunker.chunkText('你好，世界！');
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toMatchObject({ content: '你好', punctuation: '，' });
      expect(chunks[1]).toMatchObject({ content: '世界', punctuation: '！', startedBy: '，' });
    });

    test('returns an empty array for empty or whitespace-only input', () => {
      expect(chunker.chunkText('')).toEqual([]);
      expect(chunker.chunkText('   ')).toEqual([]);
    });

    test('handles text with no punctuation as a single chunk', () => {
      const chunks = chunker.chunkText('no punctuation here');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('no punctuation here');
      expect(chunks[0].punctuation).toBe('');
    });
  });

  describe('WASM/JS divergence: consecutive punctuation (verified against real output, not the stale CLAUDE.md example)', () => {
    test('mid-text consecutive punctuation merges into ONE field on the preceding chunk (no separate empty chunk)', () => {
      // '道：「说' — colon + corner-bracket both follow '道' within the same still-open chunk.
      const chunks = chunker.chunkText('道：「说');
      expect(chunks).toEqual([
        expect.objectContaining({ content: '道', punctuation: '：「', startedBy: 'start' }),
        expect.objectContaining({ content: '说', punctuation: '', startedBy: '：「' }),
      ]);
    });

    test('leading punctuation (no preceding content) DOES produce a separate empty-content chunk', () => {
      // '《标题》内容' — 《 opens with nothing before it, so it flushes as its own empty chunk
      // before '标题' is seen. This is the actual trigger for ChunkPostProcessor's
      // fixAngleQuotePositioning empty-chunk handling — not mid-text consecutive punctuation.
      const chunks = chunker.chunkText('《标题》内容');
      expect(chunks).toEqual([
        expect.objectContaining({ content: '', punctuation: '《', startedBy: 'start' }),
        expect.objectContaining({ content: '标题', punctuation: '》', startedBy: '《' }),
        expect.objectContaining({ content: '内容', punctuation: '', startedBy: '》' }),
      ]);
    });
  });
});

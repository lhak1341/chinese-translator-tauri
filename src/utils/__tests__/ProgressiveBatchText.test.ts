import { describe, test, expect, vi } from 'vitest';
import { createProgressiveBatchText } from '../text/ProgressiveBatchText';
import { ChunkPostProcessor } from '../text/ChunkPostProcessor.js';

const chunk = (content: string, translated: string, punctuation = '', startedBy = 'start') => ({
  content,
  translated,
  punctuation,
  startedBy,
  lineBreaks: '',
});

describe('createProgressiveBatchText', () => {
  test('appends each cleaned batch to the cumulative text', () => {
    const text = createProgressiveBatchText({
      translatePunctuationText: (text) => text,
      chunkPostProcessor: new ChunkPostProcessor(),
    });
    const a = chunk('甲', 'xin');
    const b = chunk('乙', ' chào');

    const first = text.addBatch([a], [a, b]);
    const second = text.addBatch([b], [a, b]);

    expect(first.cumulativeText).toBe(first.batchText);
    expect(second.cumulativeText).toBe(first.batchText + second.batchText);
  });

  test('translates punctuation with the full chunk list for neighbour context', () => {
    const chunkPostProcessor = {
      translatePunctuation: vi.fn(),
      reconstructText: vi.fn(() => 'abc'),
    };
    const translatePunctuationText = (text: string) => text.replace('，', ',');
    const a = chunk('甲', 'a');
    const b = chunk('乙', 'b');

    createProgressiveBatchText({ translatePunctuationText, chunkPostProcessor }).addBatch(
      [b],
      [a, b]
    );

    expect(chunkPostProcessor.translatePunctuation).toHaveBeenCalledWith(
      [b],
      translatePunctuationText,
      [a, b]
    );
    const [translateOrder] = chunkPostProcessor.translatePunctuation.mock.invocationCallOrder;
    const [reconstructOrder] = chunkPostProcessor.reconstructText.mock.invocationCallOrder;
    expect(translateOrder).toBeLessThan(reconstructOrder);
  });

  test('cleans the batch text', () => {
    const chunkPostProcessor = {
      translatePunctuation: vi.fn(),
      reconstructText: vi.fn(() => 'a   b'),
    };
    const { batchText } = createProgressiveBatchText({
      translatePunctuationText: (text) => text,
      chunkPostProcessor,
    }).addBatch([chunk('甲', 'a')], []);

    expect(batchText).toBe('a b');
  });

  test('a throwing batch propagates and leaves the cumulative text untouched', () => {
    let fail = false;
    const chunkPostProcessor = {
      translatePunctuation: vi.fn(),
      reconstructText: vi.fn(() => {
        if (fail) throw new Error('boom');
        return 'ok';
      }),
    };
    const text = createProgressiveBatchText({
      translatePunctuationText: (text) => text,
      chunkPostProcessor,
    });
    text.addBatch([chunk('甲', 'a')], []);

    fail = true;
    expect(() => text.addBatch([chunk('乙', 'b')], [])).toThrow('boom');

    fail = false;
    expect(text.addBatch([chunk('丙', 'c')], []).cumulativeText).toBe('okok');
  });
});

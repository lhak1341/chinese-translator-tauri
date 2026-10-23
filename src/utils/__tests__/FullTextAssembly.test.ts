import { describe, it, expect, vi } from 'vitest';
import {
  assembleFullText,
  snapshotSemanticArrays,
  type FullTextChunk,
} from '../text/FullTextAssembly';
import { ChunkPostProcessor } from '../text/ChunkPostProcessor.js';
import { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder';

const chunk = (
  content: string,
  translated: string | null,
  punctuation = '',
  startedBy = 'start'
): FullTextChunk & { punctuation: string } => ({
  content,
  translated,
  punctuation,
  startedBy,
  lineBreaks: '',
});

/** A builder holding one unit per [original, translated] pair, as the batch phase leaves it. */
function builderWith(units: Array<[string, string]>): SemanticArrayBuilder {
  const builder = new SemanticArrayBuilder();
  units.forEach(([original, translated], i) =>
    builder.addUnit(original, translated, 'characters', i)
  );
  return builder;
}

function assemble(chunks: FullTextChunk[], builder: SemanticArrayBuilder, dict = {}) {
  return assembleFullText(chunks, {
    chunkPostProcessor: new ChunkPostProcessor(),
    punctuationDict: dict,
    properNounTranslations: null,
    builder,
  });
}

describe('assembleFullText', () => {
  it('returns the finished text with its first letter capitalised', () => {
    const chunks = [chunk('说', 'thuyết'), chunk('别', 'biệt', '', ',')];
    const { translatedText } = assemble(chunks, builderWith([['说', 'thuyết']]));

    expect(translatedText.startsWith('Thuyết')).toBe(true);
  });

  it('carries the capitalised form into the semantic arrays', () => {
    const chunks = [chunk('说', 'thuyết'), chunk('别', 'biệt', '', ',')];
    const { semanticArrays } = assemble(
      chunks,
      builderWith([
        ['说', 'thuyết'],
        ['别', 'biệt'],
      ])
    );

    expect(semanticArrays.original).toEqual(['说', '别']);
    expect(semanticArrays.translated[0]).toBe('Thuyết');
    expect(semanticArrays.translated[1]).toBe('biệt');
  });

  it("gives a later lowercase repeat its own casing, not the first occurrence's", () => {
    const chunks = [
      chunk('说', 'thuyết'),
      chunk('别', 'biệt', '', ','),
      chunk('说', 'thuyết', '', ','),
    ];
    const { translatedText, semanticArrays } = assemble(
      chunks,
      builderWith([
        ['说', 'thuyết'],
        ['别', 'biệt'],
        ['说', 'thuyết'],
      ])
    );

    expect(translatedText.endsWith('thuyết')).toBe(true);
    expect(semanticArrays.translated).toEqual(['Thuyết', 'biệt', 'thuyết']);
  });

  it('leaves a unit the segment match did not place with the form the phases gave it', () => {
    // Two units, one occurrence in the text: the match places the first, and 'Thuyết' is not
    // the second unit's place, so it must not borrow the capital.
    const chunks = [chunk('说', 'thuyết'), chunk('别', 'biệt', '', ',')];
    const { prebuiltSegments, semanticArrays } = assemble(
      chunks,
      builderWith([
        ['说', 'thuyết'],
        ['说', 'thuyết'],
      ])
    );

    const placed = prebuiltSegments.filter((segment) => segment.type === 'semantic');
    expect(placed.map((segment) => segment.unitIndex)).toEqual([0]);
    expect(semanticArrays.translated).toEqual(['Thuyết', 'thuyết']);
  });

  it('builds prebuilt segments that slice to the finished text', () => {
    const chunks = [chunk('说', 'thuyết'), chunk('别', 'biệt', '', ',')];
    const { translatedText, prebuiltSegments } = assemble(
      chunks,
      builderWith([
        ['说', 'thuyết'],
        ['别', 'biệt'],
      ])
    );

    const semantic = prebuiltSegments.filter((s) => s.type === 'semantic');
    expect(semantic.length).toBe(2);
    expect(semantic.map((s) => translatedText.slice(s.start, s.end))).toEqual(['Thuyết', 'biệt']);
  });

  it('returns no segments, and logs, when the builder holds no units', () => {
    const chunks = [chunk('说', 'thuyết')];
    const { prebuiltSegments, semanticArrays } = assemble(chunks, new SemanticArrayBuilder());

    expect(prebuiltSegments).toEqual([]);
    expect(semanticArrays).toEqual({ original: [], translated: [], metadata: [] });
  });

  it('returns no segments when no chunk was translated', () => {
    const chunks = [chunk('说', null)];
    const { prebuiltSegments } = assemble(chunks, builderWith([['说', 'thuyết']]));

    expect(prebuiltSegments).toEqual([]);
  });

  it('translates punctuation over all chunks before it rebuilds the text', () => {
    const chunkPostProcessor = {
      translatePunctuation: vi.fn(),
      reconstructText: vi.fn(() => 'a'),
    };
    const chunks = [chunk('说', 'a')];
    const dict = { '，': ',' };

    assembleFullText(chunks, {
      chunkPostProcessor,
      punctuationDict: dict,
      properNounTranslations: null,
      builder: new SemanticArrayBuilder(),
    });

    expect(chunkPostProcessor.translatePunctuation).toHaveBeenCalledWith(chunks, dict);
    const [translateOrder] = chunkPostProcessor.translatePunctuation.mock.invocationCallOrder;
    const [reconstructOrder] = chunkPostProcessor.reconstructText.mock.invocationCallOrder;
    expect(translateOrder).toBeLessThan(reconstructOrder);
  });

  it('normalises the finished text to NFC', () => {
    const nfd = 'màu'.normalize('NFD');
    const { translatedText } = assemble([chunk('色', nfd)], builderWith([['色', nfd]]));

    expect(translatedText).toBe(translatedText.normalize('NFC'));
    expect(translatedText.toLowerCase()).toBe('màu');
  });
});

describe('snapshotSemanticArrays', () => {
  it('copies the three arrays, so the result shares none with its input', () => {
    const input = { original: ['甲'], translated: ['A'], metadata: [{ tokenIndex: 0 }] };
    const snapshot = snapshotSemanticArrays(input);

    expect(snapshot).toEqual(input);
    expect(snapshot.original).not.toBe(input.original);
    expect(snapshot.translated).not.toBe(input.translated);
    expect(snapshot.metadata).not.toBe(input.metadata);
    input.original.push('乙');
    expect(snapshot.original).toEqual(['甲']);
  });

  it('gives three empty arrays for a missing input', () => {
    expect(snapshotSemanticArrays(null)).toEqual({ original: [], translated: [], metadata: [] });
    expect(snapshotSemanticArrays(undefined)).toEqual({
      original: [],
      translated: [],
      metadata: [],
    });
  });
});

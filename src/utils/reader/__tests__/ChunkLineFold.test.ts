import { describe, expect, it } from 'vitest';
import { assembleTranslatedLines, linePieces } from '../ChunkLineFold';
import { buildCharacterOnlyLineSegments, buildTranslatedLineSegments } from '../LineSegments';
import type { PositionedSegment, SegmentedChunk } from '../LineSegments';
import type { ChunkPlan } from '../TranslationWindow';

const chunk = (startLine: number, endLine: number, startChar = 0, endChar = 1): ChunkPlan => ({
  key: `${startLine}:${startChar}-${endLine}:${endChar}`,
  startLine,
  startChar,
  endLine,
  endChar,
  charCount: 1,
});

describe('assembleTranslatedLines', () => {
  it('splits a chunk back into the lines it came from', () => {
    const lines = assembleTranslatedLines([{ chunk: chunk(0, 2), translatedText: 'Một\nHai\nBa' }]);

    expect([...lines.entries()]).toEqual([
      [0, 'Một'],
      [1, 'Hai'],
      [2, 'Ba'],
    ]);
  });

  it('pads with empty strings when the engine returned fewer lines than it was given', () => {
    const lines = assembleTranslatedLines([{ chunk: chunk(4, 6), translatedText: 'Một\nHai' }]);

    expect(lines.get(6)).toBe('');
  });

  it('folds surplus lines into the last one rather than shifting every line after it', () => {
    const lines = assembleTranslatedLines([
      { chunk: chunk(0, 1), translatedText: 'Một\nHai\nBa\nBốn' },
    ]);

    expect(lines.get(0)).toBe('Một');
    expect(lines.get(1)).toBe('Hai Ba Bốn');
  });

  it('rebuilds a line that was split across chunks, whatever order they arrived in', () => {
    const lines = assembleTranslatedLines([
      { chunk: chunk(5, 5, 10, 20), translatedText: 'phần hai' },
      { chunk: chunk(5, 5, 0, 10), translatedText: 'phần một ' },
    ]);

    expect(lines.get(5)).toBe('phần một phần hai');
  });

  it('returns an empty map for no entries', () => {
    expect(assembleTranslatedLines([]).size).toBe(0);
  });
});

describe('linePieces', () => {
  it('reports each landed chunk’s source span and output length per line, in book order', () => {
    const pieces = linePieces([
      { chunk: chunk(5, 5, 10, 20), translatedText: 'phần hai' },
      { chunk: chunk(5, 5, 0, 10), translatedText: 'phần một ' },
    ]);

    expect(pieces.get(5)).toEqual([
      { from: 0, to: 10, length: 9 },
      { from: 10, to: 20, length: 8 },
    ]);
  });
});

/** Deterministic PRNG, so a failure names a reproducible seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tile `text` end to end with runs of random length, a random share of them clickable. */
function tile(text: string, rand: () => number): PositionedSegment[] {
  const segments: PositionedSegment[] = [];
  let cursor = 0;
  let unitIndex = 0;
  while (cursor < text.length) {
    const end = Math.min(text.length, cursor + 1 + Math.floor(rand() * 5));
    const isClickable = rand() < 0.5;
    segments.push(
      isClickable
        ? { start: cursor, end, isClickable, unitIndex: unitIndex++ }
        : { start: cursor, end, isClickable }
    );
    cursor = end;
  }
  return segments;
}

/** Engine output for a chunk spanning `span` lines: the right number of lines, one too few, or surplus. */
function engineOutput(span: number, rand: () => number): string {
  const roll = rand();
  const parts =
    roll < 0.6 ? span : roll < 0.8 ? Math.max(1, span - 1) : span + 1 + Math.floor(rand() * 2);
  const words = ['một', 'hai', 'ba', 'bốn', 'năm', '“lời”', ''];
  return Array.from({ length: parts }, () =>
    words[Math.floor(rand() * words.length)].repeat(1 + Math.floor(rand() * 3))
  ).join('\n');
}

/** Whole-line chunks plus, on some lines, one line split across two chunks. */
function randomEntries(rand: () => number): SegmentedChunk[] {
  const entries: SegmentedChunk[] = [];
  let line = 0;
  const chunkCount = 1 + Math.floor(rand() * 5);
  for (let n = 0; n < chunkCount; n += 1) {
    const isSplitLine = rand() < 0.3;
    const plans = isSplitLine
      ? [chunk(line, line, 0, 10), chunk(line, line, 10, 20)]
      : [chunk(line, line + Math.floor(rand() * 3))];
    for (const plan of plans) {
      const span = plan.endLine - plan.startLine + 1;
      const translatedText = engineOutput(span, rand);
      const characterOnlyText = engineOutput(span, rand);
      entries.push({
        chunk: plan,
        sourceText: '',
        translatedText,
        translatedSegments: tile(translatedText, rand),
        originalSegments: [],
        characterOnlyText,
        characterOnlySegments: tile(characterOnlyText, rand),
      });
    }
    line = plans[plans.length - 1].endLine + 1;
  }
  // Arrival order is not book order: nearest-the-anchor-first filling hands back tails first.
  return entries.sort(() => rand() - 0.5);
}

describe('a row’s runs equal its plain text', () => {
  it.each(Array.from({ length: 200 }, (_, seed) => seed))('seed %i', (seed) => {
    const entries = randomEntries(mulberry32(seed));

    const plain = assembleTranslatedLines(entries);
    const runs = buildTranslatedLineSegments(entries);
    for (const [line, text] of plain) {
      expect((runs.get(line) ?? []).map((run) => run.text).join('')).toBe(text);
    }

    const gloss = assembleTranslatedLines(
      entries.map(({ chunk: plan, characterOnlyText }) => ({
        chunk: plan,
        translatedText: characterOnlyText as string,
      }))
    );
    const glossRuns = buildCharacterOnlyLineSegments(entries);
    for (const [line, text] of gloss) {
      expect((glossRuns.get(line) ?? []).map((run) => run.text).join('')).toBe(text);
    }
  });
});

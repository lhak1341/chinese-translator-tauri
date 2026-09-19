import { describe, it, expect } from 'vitest';
import {
  bridgeGlossSegments,
  buildCharacterOnlyLineSegments,
  buildOriginalLineSegments,
  buildTranslatedLineSegments,
  fillSegmentGaps,
} from '../LineSegments';
import type { PositionedSegment, SegmentedChunk } from '../LineSegments';
import { assembleTranslatedLines } from '../TranslationWindow';
import type { ChunkPlan } from '../TranslationWindow';

function plan(startLine: number, endLine: number, startChar = 0, endChar = 0): ChunkPlan {
  return {
    key: `${startLine}:${startChar}-${endLine}:${endChar}`,
    startLine,
    startChar,
    endLine,
    endChar,
    charCount: 0,
  };
}

/** A clickable run over `[start, end)`. */
function unit(start: number, end: number, unitIndex: number): PositionedSegment {
  return {
    start,
    end,
    unitIndex,
    isClickable: true,
    originalText: '原',
    translatedText: 'dịch',
    source: 'phrase',
  };
}

/** The plain text between units — the shape `matchWordSegments` emits, with no unitIndex. */
function gap(start: number, end: number): PositionedSegment {
  return { start, end, isClickable: false };
}

function chunkOf(overrides: Partial<SegmentedChunk> & { chunk: ChunkPlan }): SegmentedChunk {
  return {
    sourceText: '',
    translatedText: '',
    translatedSegments: [],
    originalSegments: [],
    ...overrides,
  };
}

/** What a row renders, as one string. */
function joined(map: Map<number, { text: string }[]>, line: number): string {
  return (map.get(line) ?? []).map((segment) => segment.text).join('');
}

describe('buildTranslatedLineSegments', () => {
  it('cuts a chunk into the lines it came from', () => {
    const chunk = plan(4, 5);
    const translatedText = 'một hai\nba bốn';
    const segments = buildTranslatedLineSegments([
      chunkOf({
        chunk,
        translatedText,
        translatedSegments: [unit(0, 3, 0), gap(3, 4), unit(4, 7, 1), gap(7, 8), unit(8, 14, 2)],
      }),
    ]);

    expect(joined(segments, 4)).toBe('một hai');
    expect(joined(segments, 5)).toBe('ba bốn');
    expect(segments.get(4)?.map((s) => s.unitIndex)).toEqual([0, -1, 1]);
  });

  it('gives every clickable run the key of the chunk whose arrays number it', () => {
    const segments = buildTranslatedLineSegments([
      chunkOf({
        chunk: plan(0, 0),
        translatedText: 'một',
        translatedSegments: [unit(0, 3, 7)],
      }),
    ]);

    expect(segments.get(0)?.[0]).toMatchObject({ unitIndex: 7, chunkKey: '0:0-0:0' });
  });

  it('leaves plain text unclickable and unattributed', () => {
    const segments = buildTranslatedLineSegments([
      chunkOf({ chunk: plan(0, 0), translatedText: '— ', translatedSegments: [gap(0, 2)] }),
    ]);

    expect(segments.get(0)?.[0]).toMatchObject({ unitIndex: -1, chunkKey: '' });
  });

  it('concatenates to exactly what the plain assembler builds for the same chunk', () => {
    // The invariant the whole module exists to keep: turning highlighting on must not
    // change a single character of what a row says, or rows reflow as chunks land.
    const chunk = plan(2, 3);
    const translatedText = 'xin chào\nthế giới';
    const entry = {
      chunk,
      translatedText,
      translatedSegments: [unit(0, 3, 0), gap(3, 4), unit(4, 8, 1), gap(8, 9), unit(9, 17, 2)],
    };

    const lines = assembleTranslatedLines([entry]);
    const segments = buildTranslatedLineSegments([chunkOf(entry)]);

    expect(joined(segments, 2)).toBe(lines.get(2));
    expect(joined(segments, 3)).toBe(lines.get(3));
  });

  it('folds an over-split chunk into its last row, newlines rendered as spaces', () => {
    // The engine added a newline the chunk was not given. The surplus belongs to the last
    // line — same rule the assembler applies — and must not arrive as a real line break, or
    // one file line would render as two rows.
    const chunk = plan(0, 1);
    const translatedText = 'một\nhai\nba';
    const entry = {
      chunk,
      translatedText,
      translatedSegments: [unit(0, 3, 0), gap(3, 4), unit(4, 7, 1), gap(7, 8), unit(8, 10, 2)],
    };

    const segments = buildTranslatedLineSegments([chunkOf(entry)]);
    const lines = assembleTranslatedLines([entry]);

    expect(joined(segments, 1)).toBe('hai ba');
    expect(joined(segments, 1)).toBe(lines.get(1));
  });

  it('rebuilds a line split across chunks in book order, whatever order they arrived in', () => {
    const tail = chunkOf({
      chunk: plan(9, 9, 4, 8),
      translatedText: 'sau',
      translatedSegments: [unit(0, 3, 0)],
    });
    const head = chunkOf({
      chunk: plan(9, 9, 0, 4),
      translatedText: 'trước ',
      translatedSegments: [unit(0, 5, 0), gap(5, 6)],
    });

    const segments = buildTranslatedLineSegments([tail, head]);

    expect(joined(segments, 9)).toBe('trước sau');
    // Offsets continue through the row rather than restarting per chunk — they are the
    // React keys, and two runs at offset 0 would collide.
    expect(segments.get(9)?.map((s) => s.lineStart)).toEqual([0, 5, 6]);
  });

  it('keeps the two chunks of a split line distinguishable by chunk key', () => {
    const segments = buildTranslatedLineSegments([
      chunkOf({
        chunk: plan(1, 1, 0, 3),
        translatedText: 'aaa',
        translatedSegments: [unit(0, 3, 0)],
      }),
      chunkOf({
        chunk: plan(1, 1, 3, 6),
        translatedText: 'bbb',
        translatedSegments: [unit(0, 3, 0)],
      }),
    ]);

    const keys = segments.get(1)?.map((s) => s.chunkKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps a row whole when its producer skipped a character', () => {
    // The gloss segmenter drops a unit it cannot find in the text, leaving a hole in what is
    // meant to be end-to-end coverage. Unsealed, the row would render one character shorter
    // than the plain line it replaces.
    const segments = buildTranslatedLineSegments([
      chunkOf({
        chunk: plan(0, 0),
        translatedText: 'một hai',
        translatedSegments: [unit(0, 3, 0), unit(4, 7, 1)],
      }),
    ]);

    expect(joined(segments, 0)).toBe('một hai');
  });

  it('keeps a row whole when its producer stopped short of the end', () => {
    const segments = buildTranslatedLineSegments([
      chunkOf({
        chunk: plan(0, 0),
        translatedText: 'một hai',
        translatedSegments: [unit(0, 3, 0)],
      }),
    ]);

    expect(joined(segments, 0)).toBe('một hai');
  });

  it('skips a line the engine returned nothing for', () => {
    const segments = buildTranslatedLineSegments([
      chunkOf({ chunk: plan(0, 2), translatedText: 'một', translatedSegments: [unit(0, 3, 0)] }),
    ]);

    expect(segments.has(0)).toBe(true);
    expect(segments.has(1)).toBe(false);
    expect(segments.has(2)).toBe(false);
  });
});

describe('buildOriginalLineSegments', () => {
  it('cuts the Chinese into its lines', () => {
    const segments = buildOriginalLineSegments([
      chunkOf({
        chunk: plan(0, 1),
        sourceText: '你好\n世界',
        originalSegments: [unit(0, 2, 0), gap(2, 3), unit(3, 5, 1)],
      }),
    ]);

    expect(joined(segments, 0)).toBe('你好');
    expect(joined(segments, 1)).toBe('世界');
  });

  it('places a chunk that begins mid-line at that line offset, not at zero', () => {
    // A long line is split mid-line across chunks. The second chunk's runs belong after the
    // first chunk's characters even when the first has not landed — the file line is on
    // screen either way, and an offset of zero would overwrite its opening.
    const segments = buildOriginalLineSegments([
      chunkOf({
        chunk: plan(3, 3, 6, 9),
        sourceText: '世界啊',
        originalSegments: [unit(0, 3, 0)],
      }),
    ]);

    expect(segments.get(3)?.[0]).toMatchObject({ lineStart: 6, text: '世界啊' });
  });
});

describe('bridgeGlossSegments', () => {
  // The chunk source is 你好世界. The full translation made two units of it — 你好 and 世界 —
  // while the gloss pass made one unit per character, which is the mismatch the bridge
  // exists to resolve.
  const originalSegments: PositionedSegment[] = [
    { start: 0, end: 2, unitIndex: 0, isClickable: true, originalText: '你好', source: 'phrase' },
    { start: 2, end: 4, unitIndex: 1, isClickable: true, originalText: '世界', source: 'phrase' },
  ];
  const glossSourceSegments: PositionedSegment[] = [
    { start: 0, end: 1, unitIndex: 0, isClickable: true },
    { start: 1, end: 2, unitIndex: 1, isClickable: true },
    { start: 2, end: 3, unitIndex: 2, isClickable: true },
    { start: 3, end: 4, unitIndex: 3, isClickable: true },
  ];
  /** The gloss's own runs, over the gloss text "nhĩ hảo thế giới". */
  const glossSegments: PositionedSegment[] = [
    { start: 0, end: 3, unitIndex: 0, isClickable: true },
    { start: 4, end: 7, unitIndex: 1, isClickable: true },
    { start: 8, end: 11, unitIndex: 2, isClickable: true },
    { start: 12, end: 16, unitIndex: 3, isClickable: true },
  ];

  it('relabels every gloss unit with the full-translation unit over the same characters', () => {
    const bridged = bridgeGlossSegments(glossSegments, glossSourceSegments, originalSegments);

    expect(bridged.map((s) => s.unitIndex)).toEqual([0, 0, 1, 1]);
  });

  it('carries the matched unit’s own text and source, for the hover title', () => {
    const bridged = bridgeGlossSegments(glossSegments, glossSourceSegments, originalSegments);

    expect(bridged[2]).toMatchObject({ originalText: '世界', source: 'phrase' });
  });

  it('demotes a gloss unit no full-translation unit covers to plain text', () => {
    // The full translation left 界 untranslated, so the gloss run over it has nothing to
    // highlight with — inventing an index would light an unrelated word.
    const partial = [originalSegments[0]];
    const bridged = bridgeGlossSegments(glossSegments, glossSourceSegments, partial);

    expect(bridged.map((s) => s.isClickable)).toEqual([true, true, false, false]);
  });

  it('breaks an overlap tie by the most characters shared', () => {
    const wideGloss: PositionedSegment[] = [{ start: 0, end: 5, unitIndex: 0, isClickable: true }];
    // The gloss unit spans 你好世 — two characters of unit 0, one of unit 1.
    const wideSource: PositionedSegment[] = [{ start: 0, end: 3, unitIndex: 0, isClickable: true }];

    const bridged = bridgeGlossSegments(wideGloss, wideSource, originalSegments);

    expect(bridged[0].unitIndex).toBe(0);
  });

  it('leaves the gloss’s own plain runs alone', () => {
    const withGap: PositionedSegment[] = [{ start: 0, end: 1, isClickable: false }];

    expect(bridgeGlossSegments(withGap, glossSourceSegments, originalSegments)).toEqual(withGap);
  });
});

describe('buildCharacterOnlyLineSegments', () => {
  it('cuts the gloss into the lines it came from', () => {
    const segments = buildCharacterOnlyLineSegments([
      chunkOf({
        chunk: plan(0, 1),
        characterOnlyText: 'nhĩ hảo\nthế giới',
        characterOnlySegments: [unit(0, 7, 0), gap(7, 8), unit(8, 16, 1)],
      }),
    ]);

    expect(joined(segments, 0)).toBe('nhĩ hảo');
    expect(joined(segments, 1)).toBe('thế giới');
  });

  it('skips a chunk whose second pass has not landed', () => {
    // The same chunk the plain gloss assembler skips: an empty string there would blank the
    // reference panel instead of leaving the Chinese showing.
    const segments = buildCharacterOnlyLineSegments([
      chunkOf({
        chunk: plan(0, 0),
        translatedText: 'một',
        translatedSegments: [unit(0, 3, 0)],
        characterOnlyText: null,
        characterOnlySegments: null,
      }),
    ]);

    expect(segments.size).toBe(0);
  });
});

describe('fillSegmentGaps', () => {
  const run = (lineStart: number, text: string) => ({
    text,
    lineStart,
    unitIndex: 0,
    chunkKey: 'k',
  });

  it('returns runs untouched when they already cover the line', () => {
    const segments = [run(0, '你好'), run(2, '世界')];
    expect(fillSegmentGaps('你好世界', segments)).toEqual(segments);
  });

  it('fills an untranslated opening from the line itself', () => {
    const filled = fillSegmentGaps('你好世界', [run(2, '世界')]);

    expect(filled.map((s) => s.text)).toEqual(['你好', '世界']);
    expect(filled[0]).toMatchObject({ unitIndex: -1, chunkKey: '', lineStart: 0 });
  });

  it('fills an untranslated tail', () => {
    const filled = fillSegmentGaps('你好世界', [run(0, '你好')]);

    expect(filled.map((s) => s.text)).toEqual(['你好', '世界']);
    expect(filled[1]).toMatchObject({ unitIndex: -1, chunkKey: '' });
  });

  it('renders the whole line as plain text when nothing covers it', () => {
    expect(fillSegmentGaps('你好', [])).toEqual([
      { text: '你好', unitIndex: -1, chunkKey: '', lineStart: 0 },
    ]);
  });

  it('adds nothing for an empty line', () => {
    expect(fillSegmentGaps('', [])).toEqual([]);
  });
});

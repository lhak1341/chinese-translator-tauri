import { describe, test, expect } from 'vitest';
import {
  EMPTY_PANEL_ROWS,
  projectPanelRows,
  rowAt,
  type Panel,
  type ProjectedChunk,
} from '../PanelRows';
import type { PositionedSegment } from '../LineSegments';
import { isBlankLine, type ChunkPlan } from '../TranslationWindow';

/** A chunk over `[startLine:startChar, endLine:endChar)`, as `planChunks` would key it. */
function plan(startLine: number, startChar: number, endLine: number, endChar: number): ChunkPlan {
  return {
    key: `${startLine}:${startChar}-${endLine}:${endChar}`,
    startLine,
    startChar,
    endLine,
    endChar,
    charCount: 0,
  };
}

/** One run tiling the whole of `text`, clickable as unit 0. */
function wholeRun(text: string): PositionedSegment[] {
  return [{ start: 0, end: text.length, unitIndex: 0, isClickable: true }];
}

function landed(
  chunk: ChunkPlan,
  sourceText: string,
  translatedText: string,
  characterOnlyText: string | null = null,
  overrides: Partial<ProjectedChunk> = {}
): ProjectedChunk {
  return {
    chunk,
    sourceText,
    translatedText,
    characterOnlyText,
    prebuiltSegments: wholeRun(translatedText),
    originalSegments: wholeRun(sourceText),
    characterOnlySegments: characterOnlyText === null ? null : wholeRun(characterOnlyText),
    ...overrides,
  };
}

const PANELS: Panel[] = ['translation', 'original', 'characterOnly'];

describe('rowAt — before anything lands', () => {
  test('a Vietnamese row shows its Chinese, dimmed and without runs', () => {
    for (const panel of ['translation', 'characterOnly'] as const) {
      const row = rowAt(EMPTY_PANEL_ROWS, panel, 0, '你好');
      expect(row).toEqual({ text: '你好', isPending: true, lang: 'zh', isBlank: false });
      // Runs describe the Vietnamese the row will become, not the stand-in.
      expect(row.segments).toBeUndefined();
    }
  });

  test('the original row is pending only on its own page, never on translation', () => {
    expect(rowAt(EMPTY_PANEL_ROWS, 'original', 0, '你好')).toMatchObject({
      text: '你好',
      isPending: false,
      lang: 'zh',
    });
    expect(rowAt(EMPTY_PANEL_ROWS, 'original', 1, undefined)).toMatchObject({
      text: undefined,
      isPending: true,
    });
  });

  test('a blank source line is blank in all three panels', () => {
    for (const panel of PANELS) {
      expect(rowAt(EMPTY_PANEL_ROWS, panel, 0, '').isBlank).toBe(true);
    }
  });
});

describe('rowAt — after chunks land', () => {
  test('shows the Vietnamese and the gloss once both land, with their runs', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào', 'bạn tốt')]);

    expect(rowAt(rows, 'translation', 0, '你好')).toMatchObject({
      text: 'Xin chào',
      isPending: false,
      lang: 'vi',
    });
    expect(rowAt(rows, 'characterOnly', 0, '你好')).toMatchObject({
      text: 'bạn tốt',
      isPending: false,
      lang: 'vi',
    });
    const runs = rowAt(rows, 'translation', 0, '你好').segments ?? [];
    expect(runs.map((r) => r.text).join('')).toBe('Xin chào');
    expect(runs[0].chunkKey).toBe('0:0-0:2');
  });

  test('a chunk whose gloss has not landed leaves the reference panel on its Chinese, not blank', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào', null)]);

    expect(rowAt(rows, 'translation', 0, '你好').isPending).toBe(false);
    expect(rowAt(rows, 'characterOnly', 0, '你好')).toEqual({
      text: '你好',
      isPending: true,
      lang: 'zh',
      isBlank: false,
    });
  });

  test('a chunk covering two lines splits back into them', () => {
    const rows = projectPanelRows([
      landed(plan(0, 0, 1, 2), '你好\n再见', 'Xin chào\nTạm biệt', 'a\nb'),
    ]);

    expect(rowAt(rows, 'translation', 0, '你好').text).toBe('Xin chào');
    expect(rowAt(rows, 'translation', 1, '再见').text).toBe('Tạm biệt');
    expect(rowAt(rows, 'characterOnly', 1, '再见').text).toBe('b');
  });

  test('a line split across two chunks is rebuilt in line order, whatever order they landed in', () => {
    const tail = landed(plan(0, 2, 0, 4), '再见', ' tạm biệt');
    const head = landed(plan(0, 0, 0, 2), '你好', 'Xin chào,');
    const rows = projectPanelRows([tail, head]);

    expect(rowAt(rows, 'translation', 0, '你好再见').text).toBe('Xin chào, tạm biệt');
  });

  test('a line split across two chunks, only the head landed, shows the rest in dimmed Chinese', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào,')]);
    const row = rowAt(rows, 'translation', 0, '你好再见');

    expect(row).toMatchObject({ text: 'Xin chào,再见', isPending: false, lang: 'vi' });
    const runs = row.segments ?? [];
    expect(runs.map((r) => r.text).join('')).toBe(row.text);
    expect(runs.filter((r) => r.isPending).map((r) => r.text)).toEqual(['再见']);
    // The landed run keeps its chunk and unit, so it still highlights.
    expect(runs[0]).toMatchObject({ text: 'Xin chào,', chunkKey: '0:0-0:2', unitIndex: 0 });
  });

  test('only the tail landed: the head shows in dimmed Chinese before it', () => {
    const rows = projectPanelRows([landed(plan(0, 2, 0, 4), '再见', 'tạm biệt')]);
    const row = rowAt(rows, 'translation', 0, '你好再见');

    expect(row.text).toBe('你好tạm biệt');
    expect(row.segments?.map((r) => [r.text, r.lineStart, !!r.isPending])).toEqual([
      ['你好', 0, true],
      ['tạm biệt', 2, false],
    ]);
  });

  test('a missing middle piece shows between the two that landed', () => {
    const rows = projectPanelRows([
      landed(plan(0, 0, 0, 1), '一', 'một '),
      landed(plan(0, 2, 0, 3), '三', ' ba'),
    ]);
    const row = rowAt(rows, 'translation', 0, '一二三');

    expect(row.text).toBe('một 二 ba');
    expect(row.segments?.filter((r) => r.isPending).map((r) => r.text)).toEqual(['二']);
  });

  test('the gloss panel shows its own missing pieces the same way', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào,', 'bạn tốt')]);
    const row = rowAt(rows, 'characterOnly', 0, '你好再见');

    expect(row.text).toBe('bạn tốt再见');
    expect(row.segments?.filter((r) => r.isPending).map((r) => r.text)).toEqual(['再见']);
  });

  test('a landed piece with no runs still gets a plain run, so the row can dim its gap', () => {
    const rows = projectPanelRows([
      landed(plan(0, 0, 0, 2), '你好', 'Xin chào,', null, { prebuiltSegments: [] }),
    ]);
    const row = rowAt(rows, 'translation', 0, '你好再见');

    expect(row.segments?.map((r) => [r.text, !!r.isPending])).toEqual([
      ['Xin chào,', false],
      ['再见', true],
    ]);
  });

  test('a fully covered line is untouched: no pending runs', () => {
    const rows = projectPanelRows([
      landed(plan(0, 0, 0, 2), '你好', 'Xin chào,'),
      landed(plan(0, 2, 0, 4), '再见', ' tạm biệt'),
    ]);
    const row = rowAt(rows, 'translation', 0, '你好再见');

    expect(row.text).toBe('Xin chào, tạm biệt');
    expect(row.segments?.some((r) => r.isPending)).toBe(false);
  });

  test('the original row fills back in whatever part of the line no run covers', () => {
    // A run for 你 only: 好 is covered by nothing.
    const rows = projectPanelRows([
      landed(plan(0, 0, 0, 2), '你好', 'Chào', null, {
        originalSegments: [{ start: 0, end: 1, unitIndex: 0, isClickable: true }],
      }),
    ]);

    const runs = rowAt(rows, 'original', 0, '你好').segments ?? [];
    expect(runs.map((r) => r.text).join('')).toBe('你好');
  });

  test('the original row has no runs while its page is unfetched, even if a chunk covered it', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào')]);
    expect(rowAt(rows, 'original', 0, undefined).segments).toBeUndefined();
  });

  test('a projection is frozen: later projections replace it, never change it', () => {
    const rows = projectPanelRows([]);
    expect(Object.isFrozen(rows)).toBe(true);
  });
});

describe('a row is blank in every panel', () => {
  test('exactly when isBlankLine says so', () => {
    for (const line of ['', '  ', '你好', undefined]) {
      for (const panel of PANELS) {
        expect(rowAt(EMPTY_PANEL_ROWS, panel, 0, line).isBlank).toBe(isBlankLine(line));
      }
    }
  });
});

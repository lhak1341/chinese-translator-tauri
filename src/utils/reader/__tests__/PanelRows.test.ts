import { describe, test, expect } from 'vitest';
import {
  EMPTY_PANEL_ROWS,
  projectPanelRows,
  rowAt,
  type Panel,
  type ProjectedChunk,
} from '../PanelRows';
import type { PositionedSegment } from '../LineSegments';
import type { ChunkPlan } from '../TranslationWindow';

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
      const row = rowAt(EMPTY_PANEL_ROWS, panel, 0, '你好', false);
      expect(row).toEqual({ text: '你好', isPending: true, lang: 'zh', isBlank: false });
      // Runs describe the Vietnamese the row will become, not the stand-in.
      expect(row.segments).toBeUndefined();
    }
  });

  test('the original row is pending only on its own page, never on translation', () => {
    expect(rowAt(EMPTY_PANEL_ROWS, 'original', 0, '你好', false)).toMatchObject({
      text: '你好',
      isPending: false,
      lang: 'zh',
    });
    expect(rowAt(EMPTY_PANEL_ROWS, 'original', 1, undefined, false)).toMatchObject({
      text: undefined,
      isPending: true,
    });
  });

  test('a blank source line is blank in all three panels', () => {
    for (const panel of PANELS) {
      expect(rowAt(EMPTY_PANEL_ROWS, panel, 0, '', true).isBlank).toBe(true);
    }
  });
});

describe('rowAt — after chunks land', () => {
  test('shows the Vietnamese and the gloss once both land, with their runs', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào', 'bạn tốt')]);

    expect(rowAt(rows, 'translation', 0, '你好', false)).toMatchObject({
      text: 'Xin chào',
      isPending: false,
      lang: 'vi',
    });
    expect(rowAt(rows, 'characterOnly', 0, '你好', false)).toMatchObject({
      text: 'bạn tốt',
      isPending: false,
      lang: 'vi',
    });
    const runs = rowAt(rows, 'translation', 0, '你好', false).segments ?? [];
    expect(runs.map((r) => r.text).join('')).toBe('Xin chào');
    expect(runs[0].chunkKey).toBe('0:0-0:2');
  });

  test('a chunk whose gloss has not landed leaves the reference panel on its Chinese, not blank', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào', null)]);

    expect(rowAt(rows, 'translation', 0, '你好', false).isPending).toBe(false);
    expect(rowAt(rows, 'characterOnly', 0, '你好', false)).toEqual({
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

    expect(rowAt(rows, 'translation', 0, '你好', false).text).toBe('Xin chào');
    expect(rowAt(rows, 'translation', 1, '再见', false).text).toBe('Tạm biệt');
    expect(rowAt(rows, 'characterOnly', 1, '再见', false).text).toBe('b');
  });

  test('a line split across two chunks is rebuilt in line order, whatever order they landed in', () => {
    const tail = landed(plan(0, 2, 0, 4), '再见', ' tạm biệt');
    const head = landed(plan(0, 0, 0, 2), '你好', 'Xin chào,');
    const rows = projectPanelRows([tail, head]);

    expect(rowAt(rows, 'translation', 0, '你好再见', false).text).toBe('Xin chào, tạm biệt');
  });

  test('a line split across two chunks, only one landed, shows that one’s Vietnamese alone', () => {
    // Characterization: the row stops being pending as soon as any piece of it lands, and
    // shows only the landed piece until the rest arrives — the untranslated half's Chinese
    // is not shown beside it.
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào,')]);

    expect(rowAt(rows, 'translation', 0, '你好再见', false)).toMatchObject({
      text: 'Xin chào,',
      isPending: false,
    });
  });

  test('the original row fills back in whatever part of the line no run covers', () => {
    // A run for 你 only: 好 is covered by nothing.
    const rows = projectPanelRows([
      landed(plan(0, 0, 0, 2), '你好', 'Chào', null, {
        originalSegments: [{ start: 0, end: 1, unitIndex: 0, isClickable: true }],
      }),
    ]);

    const runs = rowAt(rows, 'original', 0, '你好', false).segments ?? [];
    expect(runs.map((r) => r.text).join('')).toBe('你好');
  });

  test('the original row has no runs while its page is unfetched, even if a chunk covered it', () => {
    const rows = projectPanelRows([landed(plan(0, 0, 0, 2), '你好', 'Xin chào')]);
    expect(rowAt(rows, 'original', 0, undefined, false).segments).toBeUndefined();
  });

  test('a projection is frozen: later projections replace it, never change it', () => {
    const rows = projectPanelRows([]);
    expect(Object.isFrozen(rows)).toBe(true);
  });
});

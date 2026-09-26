import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  mapSelectedUnits,
  touchedUnits,
  registerSelectionMapper,
  mapSelectionRange,
  resolveQuickAddSource,
  mapTranslatorSelection,
  mapReaderSelection,
  type SourceRun,
} from '../highlighting/SelectionMapping';
import type { SemanticArrays } from '../../types/SemanticTypes';
import type { ReaderSegment } from '../reader/LineSegments';

// 林风走进南京城。 — three units, then passthrough punctuation.
const SOURCE = '林风走进南京城。\n他笑了';
const RUNS: SourceRun[] = [
  { key: '0', start: 0, end: 2 }, // 林风
  { key: '1', start: 2, end: 4 }, // 走进
  { key: '2', start: 4, end: 7 }, // 南京城
  { key: '3', start: 9, end: 10 }, // 他
];

describe('mapSelectedUnits', () => {
  test('maps one unit to its Chinese', () => {
    expect(mapSelectedUnits(['0'], RUNS, SOURCE)).toEqual({
      kind: 'mapped',
      source: '林风',
    });
  });

  test('takes the covering span, in source order, whatever order the keys arrive in', () => {
    // A reordering pattern puts unit 2 before unit 0 in the Vietnamese.
    expect(mapSelectedUnits(['2', '0'], RUNS, SOURCE)).toEqual({
      kind: 'mapped',
      source: '林风走进南京城',
    });
  });

  test('refuses a span that crosses a line break', () => {
    const result = mapSelectedUnits(['2', '3'], RUNS, SOURCE);
    expect(result.kind).toBe('refused');
  });

  test('is unmapped when no key names a run', () => {
    expect(mapSelectedUnits([], RUNS, SOURCE)).toEqual({ kind: 'unmapped' });
    expect(mapSelectedUnits(['99'], RUNS, SOURCE)).toEqual({ kind: 'unmapped' });
  });
});

function renderTranslation(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Range {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

describe('touchedUnits', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const HTML =
    '<span data-unit-index="0">Lâm Phong</span><span> </span>' +
    '<span data-unit-index="1">đi vào</span><span> </span>' +
    '<span data-unit-index="2">Nam Kinh thành</span><span>.</span>';

  test('snaps a partial selection to the whole units it touches', () => {
    const container = renderTranslation(HTML);
    const spans = container.querySelectorAll('span');
    // "Phong đi" — starts inside unit 0, ends inside unit 1.
    const range = select(spans[0].firstChild!, 4, spans[2].firstChild!, 2);
    expect(touchedUnits(range, container)).toEqual([spans[0], spans[2]]);
  });

  test('ignores runs no unit produced', () => {
    const container = renderTranslation(
      '<span data-unit-index="-1">…</span><span data-unit-index="0">Lâm</span>'
    );
    const spans = container.querySelectorAll('span');
    const range = select(spans[0].firstChild!, 0, spans[1].firstChild!, 3);
    expect(touchedUnits(range, container)).toEqual([spans[1]]);
  });

  test('is null when the selection is not inside the container', () => {
    const container = renderTranslation(HTML);
    const outside = renderTranslation('<span>elsewhere</span>');
    const range = select(outside.firstChild!.firstChild!, 0, outside.firstChild!.firstChild!, 4);
    expect(touchedUnits(range, container)).toBeNull();
  });

  test('is null for a selection over no unit', () => {
    const container = renderTranslation(HTML);
    const gap = container.querySelectorAll('span')[5];
    const range = select(gap.firstChild!, 0, gap.firstChild!, 1);
    expect(touchedUnits(range, container)).toBeNull();
  });
});

describe('mapSelectionRange', () => {
  const range = (): Range => {
    const text = document.createTextNode('林风');
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 2);
    return r;
  };

  test('asks each registered mapper, taking the first that recognises the selection', () => {
    const unregisterA = registerSelectionMapper(() => ({ kind: 'unmapped' }));
    const unregisterB = registerSelectionMapper(() => ({
      kind: 'mapped',
      source: '林风',
    }));
    expect(mapSelectionRange(range())).toEqual({
      kind: 'mapped',
      source: '林风',
    });
    unregisterB();
    expect(mapSelectionRange(range())).toEqual({ kind: 'unmapped' });
    unregisterA();
  });

  test('a mapper that throws is treated as unmapped', () => {
    const unregister = registerSelectionMapper(() => {
      throw new Error('stale');
    });
    expect(mapSelectionRange(range())).toEqual({ kind: 'unmapped' });
    unregister();
  });

  test('no selection is unmapped without asking any mapper', () => {
    let asked = 0;
    const unregister = registerSelectionMapper(() => {
      asked += 1;
      return { kind: 'refused', reason: 'x' };
    });
    expect(mapSelectionRange(null)).toEqual({ kind: 'unmapped' });
    expect(asked).toBe(0);
    unregister();
  });
});

describe('mapTranslatorSelection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Units recorded in completion order, not text order: 南京城 first.
  const ORIGINAL = '林风走进南京城。';
  const ARRAYS = {
    original: ['南京城', '林风', '走进'],
    translated: ['Nam Kinh thành', 'Lâm Phong', 'đi vào'],
    metadata: [{ tokenIndex: 2 }, { tokenIndex: 0 }, { tokenIndex: 1 }],
  } as unknown as SemanticArrays;

  test('maps selected Vietnamese units to their covering span of the input', () => {
    const container = renderTranslation(
      '<span data-unit-index="1">Lâm Phong</span><span> </span>' +
        '<span data-unit-index="2">đi vào</span><span> </span>' +
        '<span data-unit-index="0">Nam Kinh thành</span>'
    );
    const spans = container.querySelectorAll('span');
    const range = select(spans[2].firstChild!, 1, spans[4].firstChild!, 3);
    expect(mapTranslatorSelection(range, container, ORIGINAL, ARRAYS)).toEqual({
      kind: 'mapped',
      source: '走进南京城',
    });
  });

  test('is unmapped with no container or no translation yet', () => {
    const container = renderTranslation('<span data-unit-index="1">Lâm Phong</span>');
    const span = container.querySelector('span')!;
    const range = select(span.firstChild!, 0, span.firstChild!, 3);
    expect(mapTranslatorSelection(range, null, ORIGINAL, ARRAYS).kind).toBe('unmapped');
    expect(mapTranslatorSelection(range, container, ORIGINAL, null).kind).toBe('unmapped');
  });
});

describe('mapReaderSelection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const row = (index: number, spans: string): string =>
    `<div data-index="${index}"><p>${spans}</p></div>`;
  const unit = (chunkKey: string, unitIndex: number, text: string): string =>
    `<span data-chunk-key="${chunkKey}" data-unit-index="${unitIndex}">${text}</span>`;

  const LINE = '他说林风来了';
  const originalRow = (index: number): { text: string; segments: ReaderSegment[] } | undefined =>
    index === 7
      ? {
          text: LINE,
          segments: [
            { text: '他说', unitIndex: 4, chunkKey: 'c1', lineStart: 0 },
            { text: '林风', unitIndex: 5, chunkKey: 'c1', lineStart: 2 },
            { text: '来了', unitIndex: 6, chunkKey: 'c1', lineStart: 4 },
          ],
        }
      : undefined;

  test('maps units within one row, matched by chunk and unit', () => {
    const container = renderTranslation(
      row(7, unit('c1', 4, 'Hắn nói') + '<span> </span>' + unit('c1', 5, 'Lâm Phong'))
    );
    const spans = container.querySelectorAll('span[data-unit-index]');
    const range = select(spans[1].firstChild!, 0, spans[1].firstChild!, 3);
    expect(mapReaderSelection(range, container, originalRow)).toEqual({
      kind: 'mapped',
      source: '林风',
    });
  });

  test('refuses a selection across rows', () => {
    const container = renderTranslation(
      row(7, unit('c1', 5, 'Lâm Phong')) + row(8, unit('c1', 9, 'đến'))
    );
    const spans = container.querySelectorAll('span[data-unit-index]');
    const range = select(spans[0].firstChild!, 0, spans[1].firstChild!, 2);
    expect(mapReaderSelection(range, container, originalRow).kind).toBe('refused');
  });

  test('is unmapped when the row has no Chinese segments yet', () => {
    const container = renderTranslation(row(3, unit('c1', 5, 'Lâm Phong')));
    const span = container.querySelector('span')!;
    const range = select(span.firstChild!, 0, span.firstChild!, 3);
    expect(mapReaderSelection(range, container, originalRow).kind).toBe('unmapped');
  });
});

describe('resolveQuickAddSource', () => {
  const selectionOf = (text: string, range: Range | null = null): Selection =>
    ({
      toString: () => text,
      rangeCount: range ? 1 : 0,
      getRangeAt: () => range,
    }) as unknown as Selection;
  const rangeOver = (text: string): Range => {
    const node = document.createTextNode(text);
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, text.length);
    return r;
  };

  test('a mapped selection gives its Chinese, without reading the clipboard', async () => {
    const unregister = registerSelectionMapper(() => ({ kind: 'mapped', source: '林风' }));
    const readClipboard = vi.fn();
    const result = await resolveQuickAddSource(
      selectionOf('Lâm Phong', rangeOver('Lâm Phong')),
      readClipboard
    );
    unregister();
    expect(result).toEqual({ kind: 'source', text: '林风' });
    expect(readClipboard).not.toHaveBeenCalled();
  });

  test('a refused selection is refused, whatever the clipboard holds', async () => {
    const unregister = registerSelectionMapper(() => ({ kind: 'refused', reason: 'two lines' }));
    const result = await resolveQuickAddSource(
      selectionOf('a\nb', rangeOver('a\nb')),
      async () => '萧炎'
    );
    unregister();
    expect(result).toEqual({ kind: 'refused', reason: 'two lines' });
  });

  test('any other selection gives its own text, trimmed', async () => {
    const readClipboard = vi.fn();
    expect(await resolveQuickAddSource(selectionOf(' 太岳山脉 '), readClipboard)).toEqual({
      kind: 'source',
      text: '太岳山脉',
    });
    expect(readClipboard).not.toHaveBeenCalled();
  });

  test('nothing selected falls back to the clipboard', async () => {
    expect(await resolveQuickAddSource(null, async () => ' 萧炎\n')).toEqual({
      kind: 'source',
      text: '萧炎',
    });
    expect(await resolveQuickAddSource(selectionOf('  '), async () => '萧炎')).toEqual({
      kind: 'source',
      text: '萧炎',
    });
  });

  test('a clipboard that cannot be read gives an empty source, not a failure', async () => {
    const result = await resolveQuickAddSource(null, async () => {
      throw new Error('denied');
    });
    expect(result).toEqual({ kind: 'source', text: '' });
  });
});

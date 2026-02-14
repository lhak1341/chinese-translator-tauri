/**
 * Tests for groupSegmentsIntoParagraphs
 *
 * Documents the three paragraph-break rules:
 * 1. \n\n (double newline / blank line between two newlines)
 * 2. \n followed by indented text (space, \u3000, or full-width 　)
 * 3. Regular single \n not followed by blank/indented line → preserved within paragraph
 *
 * IMPORTANT: This utility is for ClickableOriginalSemantic and ClickableTranslationSemantic
 * (Chinese-text panels). ClickableTranslationOptimized uses its OWN inline paragraph logic
 * that breaks on every \n. Do NOT replace that inline logic with this utility.
 */

import { describe, test, expect } from 'vitest';
import { groupSegmentsIntoParagraphs, type Segment } from '../ParagraphGrouping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seg(text: string, extra: Partial<Segment> = {}): Segment {
  return {
    type: 'text',
    text,
    start: 0,
    end: text.length,
    unitIndex: 0,
    isClickable: false,
    ...extra,
  };
}

/** Flatten all segment texts in a paragraph to a single string */
function texts(paragraph: Segment[]): string[] {
  return paragraph.map((s) => s.text);
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — edge cases', () => {
  test('empty array returns empty array', () => {
    expect(groupSegmentsIntoParagraphs([])).toEqual([]);
  });

  test('single segment with no newline → one paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('你好')]);
    expect(result).toHaveLength(1);
    expect(texts(result[0])).toEqual(['你好']);
  });

  test('multiple segments with no newlines → one paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('你'), seg('好'), seg('吗')]);
    expect(result).toHaveLength(1);
    expect(texts(result[0])).toEqual(['你', '好', '吗']);
  });

  test('all-newline segments that never build a paragraph → empty result', () => {
    // Consecutive \n segments with nothing before them — nothing to push
    const result = groupSegmentsIntoParagraphs([seg('\n'), seg('\n')]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 1: \n\n creates a paragraph break
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — rule 1: double newline', () => {
  test('\\n\\n within a single segment creates two paragraphs', () => {
    const result = groupSegmentsIntoParagraphs([seg('第一段\n\n第二段')]);
    expect(result).toHaveLength(2);
    expect(texts(result[0])).toEqual(['第一段']);
    expect(texts(result[1])).toContain('第二段');
  });

  test('standalone \\n segment followed by another \\n segment creates a break', () => {
    // Segments: ['text', '\n', '\n', 'text2'] — simulates two separate newline tokens
    const result = groupSegmentsIntoParagraphs([
      seg('第一段'),
      seg('\n'),
      seg('\n'),
      seg('第二段'),
    ]);
    // The first \n: nextLine is '' (end of that segment's inner lines) → paragraph break
    expect(result).toHaveLength(2);
    expect(texts(result[0])).toContain('第一段');
    expect(texts(result[1])).toContain('第二段');
  });

  test('content after \\n\\n goes into the second paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('前\n\n后')]);
    expect(result[1].some((s) => s.text === '后')).toBe(true);
  });

  test('trailing \\n on a segment (text + \\n) counts as paragraph break for following content', () => {
    // segment 'foo\n' then segment 'bar' — the trailing \n has nextLine='' → break
    const result = groupSegmentsIntoParagraphs([seg('foo\n'), seg('bar')]);
    expect(result).toHaveLength(2);
    expect(texts(result[0])).toContain('foo');
    expect(texts(result[1])).toContain('bar');
  });
});

// ---------------------------------------------------------------------------
// Rule 2: \n followed by indented text creates a paragraph break
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — rule 2: indented next line', () => {
  test('\\n followed by full-width space 　 creates a paragraph break', () => {
    const result = groupSegmentsIntoParagraphs([seg('第一段\n　第二段')]);
    expect(result).toHaveLength(2);
    expect(texts(result[0])).toContain('第一段');
    expect(texts(result[1])).toContain('　第二段');
  });

  test('\\n followed by ASCII space creates a paragraph break', () => {
    const result = groupSegmentsIntoParagraphs([seg('第一段\n  第二段')]);
    expect(result).toHaveLength(2);
  });

  test('\\n followed by \\u3000 (ideographic space) creates a paragraph break', () => {
    const result = groupSegmentsIntoParagraphs([seg('第一段\n\u3000第二段')]);
    expect(result).toHaveLength(2);
  });

  test('multiple indented paragraphs each become their own paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('A\n　B\n　C')]);
    expect(result).toHaveLength(3);
    expect(texts(result[0])).toContain('A');
    expect(texts(result[1])).toContain('　B');
    expect(texts(result[2])).toContain('　C');
  });

  test('empty paragraph guards prevent pushing empty paragraph before first content', () => {
    // '\n　content' with no preceding text — no empty paragraph pushed
    const result = groupSegmentsIntoParagraphs([seg('\n　第一段')]);
    expect(result).toHaveLength(1);
    expect(texts(result[0])).toContain('　第一段');
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Regular \n stays within the same paragraph
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — rule 3: regular newline within paragraph', () => {
  test('\\n followed by non-blank non-indented text stays in same paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('行一\n行二')]);
    expect(result).toHaveLength(1);
  });

  test('regular \\n is preserved as a \\n segment within the paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('行一\n行二')]);
    expect(result[0].some((s) => s.text === '\n')).toBe(true);
  });

  test('multiple regular newlines all stay in one paragraph', () => {
    const result = groupSegmentsIntoParagraphs([seg('A\nB\nC')]);
    expect(result).toHaveLength(1);
    expect(result[0].filter((s) => s.text !== '\n').map((s) => s.text)).toEqual(['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// Metadata isolation
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — metadata isolation', () => {
  test('metadata objects are shallow-copied, not shared', () => {
    const meta = { phase: 'character', confidence: 1 };
    const result = groupSegmentsIntoParagraphs([seg('A\nB', { metadata: meta })]);
    const segA = result[0].find((s) => s.text === 'A')!;
    const segB = result[0].find((s) => s.text === 'B' || s.text === '\n' || s.text === 'A');
    // Mutating the original metadata should not affect copies in segments
    meta.confidence = 99;
    expect(segA.metadata?.confidence).toBe(1);
  });

  test('segment without metadata produces undefined metadata in copies', () => {
    const result = groupSegmentsIntoParagraphs([seg('A\nB')]);
    result[0].forEach((s) => {
      expect(s.metadata).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-segment interactions
// ---------------------------------------------------------------------------

describe('groupSegmentsIntoParagraphs — multi-segment', () => {
  test('segments spanning a paragraph break are correctly split across paragraphs', () => {
    const result = groupSegmentsIntoParagraphs([seg('你好'), seg('\n\n'), seg('世界')]);
    expect(result).toHaveLength(2);
    expect(texts(result[0])).toContain('你好');
    expect(texts(result[1])).toContain('世界');
  });

  test('final paragraph is always included even without trailing newline', () => {
    const result = groupSegmentsIntoParagraphs([seg('A\n　B'), seg('C')]);
    expect(result).toHaveLength(2);
    // 'C' is appended to the second paragraph
    expect(texts(result[1])).toContain('C');
  });

  test('non-clickable and clickable segments are both handled', () => {
    const result = groupSegmentsIntoParagraphs([
      seg('词语', { type: 'semantic', isClickable: true, unitIndex: 1 }),
      seg('\n　'),
      seg('下一段', { type: 'semantic', isClickable: true, unitIndex: 2 }),
    ]);
    expect(result).toHaveLength(2);
  });
});

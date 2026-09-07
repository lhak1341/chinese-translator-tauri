import { describe, test, expect } from 'vitest';
import { matchWordSegments } from '../highlighting/WordSegmentMatcher';

function arrays(
  entries: Array<{ original: string; translated: string | null; tokenIndex?: number }>
) {
  return {
    original: entries.map((e) => e.original),
    translated: entries.map((e) => e.translated),
    metadata: entries.map((e) => ({ tokenIndex: e.tokenIndex, source: 'test' })),
  };
}

describe('matchWordSegments', () => {
  test('builds semantic segments in output order with spacing between them', () => {
    const semanticArrays = arrays([
      { original: '第', translated: 'Thứ', tokenIndex: 0 },
      { original: '五百八十', translated: '580', tokenIndex: 1 },
      { original: '章', translated: 'chương', tokenIndex: 2 },
    ]);
    const output = 'Thứ 580 chương';

    const segments = matchWordSegments(semanticArrays, output);
    const semanticSegments = segments.filter((s) => s.type === 'semantic');

    expect(semanticSegments.map((s) => s.translatedText)).toEqual(['Thứ', '580', 'chương']);
    expect(segments.some((s) => s.type === 'spacing')).toBe(true);
  });

  test('skips consumed tokens (translated: null) — does not throw normalizing null', () => {
    const semanticArrays = arrays([
      { original: 'X', translated: null, tokenIndex: 0 },
      { original: 'Y', translated: 'Y-translated', tokenIndex: 1 },
    ]);

    expect(() => matchWordSegments(semanticArrays, 'Y-translated')).not.toThrow();
    const segments = matchWordSegments(semanticArrays, 'Y-translated');
    expect(segments.filter((s) => s.type === 'semantic')).toHaveLength(1);
  });

  test('longest-first sort prevents a short word matching inside a longer one', () => {
    // "mà" must not claim a position inside "màu trắng" — "màu" is longer and must be tried first.
    const semanticArrays = arrays([
      { original: 'X', translated: 'mà', tokenIndex: 5 },
      { original: 'Y', translated: 'màu trắng', tokenIndex: 0 },
    ]);
    const output = 'màu trắng và mà';

    const segments = matchWordSegments(semanticArrays, output);
    const semanticSegments = segments.filter((s) => s.type === 'semantic');

    expect(semanticSegments.map((s) => s.translatedText)).toEqual(['màu trắng', 'mà']);
    expect(semanticSegments[0].start).toBe(0);
    expect(semanticSegments[1].start).toBeGreaterThan(semanticSegments[0].end);
  });

  test('same-length duplicates claim positions in tokenIndex (Chinese text) order', () => {
    // Both "没" and "不" translate to "không" — earlier tokenIndex must claim the earlier position.
    const semanticArrays = arrays([
      { original: '不', translated: 'không', tokenIndex: 3 },
      { original: '没', translated: 'không', tokenIndex: 1 },
    ]);
    const output = 'không không';

    const segments = matchWordSegments(semanticArrays, output);
    const semanticSegments = segments.filter((s) => s.type === 'semantic');

    // tokenIndex 1 (没) should claim position 0; tokenIndex 3 (不) should claim the later position.
    expect(semanticSegments[0].originalText).toBe('没');
    expect(semanticSegments[1].originalText).toBe('不');
  });

  test('coincidental text collision between differently-sized candidates resolves by tokenIndex, not length', () => {
    // Occurrence 1 (earlier tokenIndex) is three separate char-tokens whose translations
    // happen to assemble into the same string as occurrence 2's single combined-word
    // candidate (later tokenIndex). The combined word is longer, so a length-first sort
    // would process it first and steal occurrence 1's earlier position via indexOf(text, 0).
    const semanticArrays = arrays([
      { original: '呼', translated: 'Hô', tokenIndex: 19 },
      { original: '老', translated: 'lão', tokenIndex: 20 },
      { original: '摩', translated: 'ma', tokenIndex: 21 },
      { original: '呼老魔', translated: 'Hô lão ma', tokenIndex: 50 },
    ]);
    const output = 'Hô lão ma này vài vị, Hô lão ma cũng không';

    const segments = matchWordSegments(semanticArrays, output);
    const semanticSegments = segments.filter((s) => s.type === 'semantic');

    // The three char-tokens (tokenIndex 19-21) must claim the FIRST "Hô lão ma", and the
    // combined proper-noun token (tokenIndex 50) must claim the SECOND.
    expect(semanticSegments.map((s) => s.originalText)).toEqual(['呼', '老', '摩', '呼老魔']);
    expect(semanticSegments[0].start).toBe(0);
    expect(semanticSegments[3].start).toBe(output.indexOf('Hô lão ma', 1));
  });

  test('appends trailing unmatched text as a remaining, non-clickable segment', () => {
    const semanticArrays = arrays([{ original: 'X', translated: 'X-out', tokenIndex: 0 }]);
    const output = 'X-out and more';

    const segments = matchWordSegments(semanticArrays, output);
    const remaining = segments.find((s) => s.type === 'remaining');

    expect(remaining).toBeDefined();
    expect(remaining?.text).toBe(' and more');
  });

  test('returns only the remaining segment when no candidate is found in the output', () => {
    const semanticArrays = arrays([{ original: 'X', translated: 'nope', tokenIndex: 0 }]);
    const output = 'completely different text';

    const segments = matchWordSegments(semanticArrays, output);

    expect(segments.filter((s) => s.type === 'semantic')).toHaveLength(0);
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('remaining');
  });

  test('handles empty semantic arrays against non-empty output', () => {
    const semanticArrays = arrays([]);
    const segments = matchWordSegments(semanticArrays, 'just plain text');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(
      expect.objectContaining({ type: 'remaining', text: 'just plain text' })
    );
  });
});

describe('matchWordSegments — NFC/NFD normalization', () => {
  test('NFD-encoded output text does not misalign segment positions', () => {
    const nfdWord = 'màu'.normalize('NFD'); // 'màu' decomposed, 4 UTF-16 units
    const semanticArrays = arrays([{ original: '颜色', translated: nfdWord, tokenIndex: 0 }]);
    const output = (nfdWord + ' trắng').normalize('NFD');

    const segments = matchWordSegments(semanticArrays, output);
    const sem = segments.filter((s) => s.type === 'semantic');

    expect(sem).toHaveLength(1);
    expect(sem[0].translatedText.normalize('NFC')).toBe('màu');
  });

  test('NFD candidate word matches inside an NFC output text', () => {
    const nfdWord = 'màu'.normalize('NFD');
    const semanticArrays = arrays([{ original: '颜色', translated: nfdWord, tokenIndex: 0 }]);
    const output = 'màu trắng'.normalize('NFC');

    const segments = matchWordSegments(semanticArrays, output);
    const sem = segments.filter((s) => s.type === 'semantic');

    expect(sem).toHaveLength(1);
    expect(sem[0].translatedText.normalize('NFC')).toBe('màu');
    expect(sem[0].end).toBe(sem[0].start + 'màu'.normalize('NFC').length);
  });
});

/**
 * TextFinishing: the per-mode "assembled text → final text" entry points in FormattingPasses.ts.
 * The rules are tested through the entry points a caller uses, not by reaching past them; the two
 * building blocks get a few direct cases because their regexes carry the bug history.
 *
 * Mode differences are pinned on purpose (decided 2026-10-05):
 *   - Full Translation strips line-edge whitespace; character-only keeps a line's indentation.
 *   - Both space a letter from an adjacent digit and normalise to NFC.
 */
import { describe, expect, it } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import {
  cleanFullText,
  finishCharOnlyText,
  finishFullText,
  normalizeLineWhitespace,
  spaceLettersAndDigits,
} from '../text/FormattingPasses';

const noPunctuation = () => null;
const charOnly = (text: string) => finishCharOnlyText(text, noPunctuation);

describe('spaceLettersAndDigits', () => {
  it.each([
    ['Thứ422giới', 'Thứ 422 giới'],
    ['abc123', 'abc 123'],
    ['ABC thuyết 123def', 'ABC thuyết 123 def'],
  ])('spaces a letter from a digit: %s', (input, expected) => {
    expect(spaceLettersAndDigits(input)).toBe(expected);
  });

  // Punctuation is never a match target, so no mark can pull a space in next to a number.
  it.each(['2,700!', '“2,700!”', '2,700?', '2,700:', '2,700;', '(23/30)', '1992~1996', '99.9%'])(
    'leaves number-flanking punctuation alone: %s',
    (input) => {
      expect(spaceLettersAndDigits(input)).toBe(input);
    }
  );
});

describe('normalizeLineWhitespace', () => {
  it('collapses runs of spaces and tabs', () => {
    expect(normalizeLineWhitespace('a  \t b')).toBe('a b');
  });

  it('strips spaces at line edges but keeps every line break', () => {
    expect(normalizeLineWhitespace('  a  \n  b  \n\n  c')).toBe('a\nb\n\nc');
  });

  it('turns an ideographic-space indent into nothing at a line start', () => {
    expect(normalizeLineWhitespace('a\n　　b')).toBe('a\nb');
  });
});

describe('cleanFullText', () => {
  it('returns an empty value unchanged', () => {
    expect(cleanFullText('')).toBe('');
  });

  it('does not normalise to NFC (progressive batches are cleaned before the whole text is)', () => {
    const nfd = 'màu';
    expect(cleanFullText(nfd)).toBe(nfd);
  });
});

describe('finishFullText', () => {
  it('spaces, collapses and normalises to NFC', () => {
    expect(finishFullText('Thứ422  giới')).toBe('Thứ 422 giới');
    expect(finishFullText('màu')).toBe('màu');
  });

  it('keeps a trailing newline', () => {
    expect(finishFullText('a\n')).toBe('a\n');
  });

  it('strips an ideographic indent', () => {
    expect(finishFullText('a\n　　b')).toBe('a\nb');
  });
});

describe('finishCharOnlyText', () => {
  it('spaces a letter from a digit and keeps number punctuation glued', () => {
    expect(charOnly('abc123 thuyết')).toBe('Abc 123 thuyết');
    expect(charOnly('Thuyết 2,700! Biệt')).toBe('Thuyết 2,700! Biệt');
  });

  it('normalises to NFC', () => {
    expect(charOnly('màu')).toBe('Màu');
  });

  it('keeps a line’s ideographic indentation (Full Translation strips it)', () => {
    expect(charOnly('a\n　　b')).toBe('A\n　　B');
  });

  it('drops a trailing newline through the whole-text trim', () => {
    expect(charOnly('a\n')).toBe('A');
  });
});

// Through the real engine, one input per mode: the engine-level pin that the two modes stay as
// decided and that "2,700!" survives both. Dictionary values are Vietnamese; punctuation is the
// full-width → ASCII mapping the app ships.
describe('engine parity: Full Translation vs character-only', () => {
  const dictionaries = {
    characters: { 说: 'thuyết', 别: 'biệt', 单: 'đan', 道: 'nói', 色: 'màu' },
    phrases: {},
    patterns: {},
    properNouns: {},
    conversion: {},
    punctuation: { '，': ',', '。': '.', '！': '!', '：': ':' },
  };

  async function engine() {
    const e = createTranslationEngine();
    await e.initialize(dictionaries, { activeProperNouns: ['properNouns'] });
    return e;
  }

  it('keeps "2,700!" in both modes', async () => {
    const e = await engine();
    const input = '说2,700！别';
    const charOnlyResult = await e.translateWithCharactersOnly(input, {});
    const full = await e.translateWithSegments(input, {});
    expect(charOnlyResult.translatedText).toBe('Thuyết 2,700! Biệt');
    expect(full.translatedText).toBe('Thuyết 2,700! Biệt');
  });

  it('gives every character-only unit a position that slices to its own text', async () => {
    const e = await engine();
    const { translatedText, semanticArrays } = await e.translateWithCharactersOnly('说别说', {});

    expect(translatedText).toBe('Thuyết biệt thuyết');
    expect(semanticArrays.translated).toHaveLength(3);
    semanticArrays.metadata.forEach((meta, i) => {
      expect(translatedText.slice(meta.translatedStart, meta.translatedEnd)).toBe(
        semanticArrays.translated[i]
      );
    });
  });

  it('keeps a thousands separator inside a larger number in both modes', async () => {
    const e = await engine();
    const input = '说1,200别';
    expect((await e.translateWithCharactersOnly(input, {})).translatedText).toBe(
      'Thuyết 1,200 biệt'
    );
    expect((await e.translateWithSegments(input, {})).translatedText).toBe('Thuyết 1,200 biệt');
  });

  it('still gives a list comma its space', async () => {
    const e = await engine();
    expect((await e.translateWithSegments('说1，2别', {})).translatedText).toBe('Thuyết 1, 2 biệt');
  });

  it('character-only keeps indentation that Full Translation strips', async () => {
    const e = await engine();
    const input = '说别\n　　单道';
    expect((await e.translateWithCharactersOnly(input, {})).translatedText).toBe(
      'Thuyết biệt\n　　Đan nói'
    );
    expect((await e.translateWithSegments(input, {})).translatedText).toBe('Thuyết biệt\nĐan nói');
  });

  it('character-only output is NFC even when a dictionary value is NFD', async () => {
    const e = await engine();
    const { translatedText } = await e.translateWithCharactersOnly('色', {});
    expect(translatedText).toBe(translatedText.normalize('NFC'));
    expect(translatedText.toLowerCase()).toBe('màu');
  });
});

// The character-only pass builds its own semantic arrays and returns them, so it must leave the
// engine's shared builder and segment list alone. A leak lands inside a Full Translation that
// starts while the pass awaits its lookup index (architecture review 2026-10-06, candidate #2).
describe('character-only pass leaves the engine state of Full Translation alone', () => {
  const dictionaries = {
    characters: { 说: 'thuyết', 别: 'biệt', 单: 'đan' },
    phrases: { 说别: 'từ biệt' },
    patterns: {},
    properNouns: {},
    conversion: {},
    punctuation: {},
  };

  async function engine() {
    const e = createTranslationEngine();
    await e.initialize(dictionaries, { activeProperNouns: ['properNouns'] });
    return e;
  }

  it('adds nothing to the shared builder, from a fresh engine', async () => {
    const e = await engine();
    await e.translateWithCharactersOnly('说别单', {});
    expect(e.semanticArrayBuilder.getArrays().translated).toEqual([]);
  });

  it('leaves the arrays a Full Translation just produced as they were', async () => {
    const e = await engine();
    await e.translateWithSegments('说别单', {});
    const arraysBefore = e.semanticArrayBuilder.getArrays();

    const result = await e.translateWithCharactersOnly('说别单', {});

    expect(e.semanticArrayBuilder.getArrays()).toEqual(arraysBefore);
    expect(result.semanticArrays.translated.length).toBeGreaterThan(0);
  });

  it('Full Translation returns the prebuilt segments it built, from the result alone', async () => {
    const e = await engine();
    const result = await e.translateWithSegments('说别单', {});
    expect(result.prebuiltSegments.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('segments');
  });
});

describe('character-only pass is a point lookup (ADR-087)', () => {
  const dictionaries = {
    characters: { 说: 'thuyết', 别: 'biệt', 单: 'đan' },
    phrases: {},
    patterns: {},
    properNouns: {},
    conversion: {},
    punctuation: {},
  };
  const longText = '说别单'.repeat(20);

  it('glosses a 60-character text one character at a time', async () => {
    const e = createTranslationEngine();
    await e.initialize(dictionaries, { activeProperNouns: ['properNouns'] });

    const result = await e.translateWithCharactersOnly(longText, {});

    expect(result.translatedText).toBe(`Thuyết biệt đan${' thuyết biệt đan'.repeat(19)}`);
    expect(result.semanticArrays.original).toHaveLength(60);
  });
});

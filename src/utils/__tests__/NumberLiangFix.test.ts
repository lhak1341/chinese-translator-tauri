import { describe, it, expect } from 'vitest';
import { fixNumberPlusLiang } from '../NumberLiangFix';
import { createTranslationEngine } from '../TranslationEngine.js';

type Tok = { value: string; translated?: string | null; translationSource?: string | null };

const number = (translated: string): Tok => ({
  value: '五',
  translated,
  translationSource: 'number_conversion',
});
const consumed = (): Tok => ({
  value: '百',
  translated: null,
  translationSource: 'number_conversion_consumed',
});
const liang = (translated: string | null = 'lưỡng'): Tok => ({
  value: '两',
  translated,
  translationSource: 'characters',
});

describe('fixNumberPlusLiang', () => {
  it('reads 两 as lượng after a converted number', () => {
    const tokens = [number('520'), liang()];
    fixNumberPlusLiang(tokens);

    expect(tokens[1].translated).toBe('lượng');
    expect(tokens[1].translationSource).toBe('number_plus_liang_fix');
  });

  it('accepts a thousands-separated number', () => {
    const tokens = [number('2,700'), liang()];
    fixNumberPlusLiang(tokens);

    expect(tokens[1].translated).toBe('lượng');
  });

  it("skips the number's consumed followers before checking", () => {
    const tokens = [number('500'), consumed(), consumed(), liang()];
    fixNumberPlusLiang(tokens);

    expect(tokens[3].translated).toBe('lượng');
  });

  it('checks only the first non-consumed token after the number', () => {
    const space = { value: ' ', translated: ' ', translationSource: 'preserved-whitespace' };
    const tokens = [number('520'), space, liang()];
    fixNumberPlusLiang(tokens);

    expect(tokens[2].translated).toBe('lưỡng');
  });

  it('leaves a 两 with any other translation alone', () => {
    for (const other of ['hai người', 'hai', 'lượng']) {
      const tokens = [number('520'), liang(other)];
      fixNumberPlusLiang(tokens);

      expect(tokens[1].translated).toBe(other);
      expect(tokens[1].translationSource).toBe('characters');
    }
  });

  it('leaves 两 alone after a translation that is not a number', () => {
    const tokens = [{ value: '五', translated: 'ngũ', translationSource: 'characters' }, liang()];
    fixNumberPlusLiang(tokens);

    expect(tokens[1].translated).toBe('lưỡng');
  });

  it('leaves a number that is not followed by 两 alone', () => {
    const next = { value: '银', translated: 'ngân', translationSource: 'characters' };
    const tokens = [number('520'), next];
    fixNumberPlusLiang(tokens);

    expect(tokens[1].translated).toBe('ngân');
  });
});

// Through the real engine: the rule sits after Phase 5, so only an engine run proves the wiring.
describe('fixNumberPlusLiang in the engine', () => {
  const dictionaries = {
    characters: { 五: 'ngũ', 二: 'nhị', 十: 'thập', 百: 'bách', 两: 'lưỡng' },
    phrases: {},
    patterns: {},
    properNouns: {},
    conversion: {},
    punctuation: {},
  };

  async function translate(text: string) {
    const engine = createTranslationEngine();
    await engine.initialize(dictionaries, { activeProperNouns: ['properNouns'] });
    return (await engine.translateWithSegments(text, {})).translatedText;
  }

  it('reads 两 after a converted number as the tael unit', async () => {
    expect(await translate('五百二十两')).toBe('520 lượng');
  });

  it('leaves a lone numeral and its 两 as the dictionary has them', async () => {
    expect(await translate('五两')).toBe('Ngũ lưỡng');
  });
});

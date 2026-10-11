/**
 * Spike: can TranslationEngine be instantiated and translateSinglePass called in jsdom?
 *
 * WASM will fail to load (no binary in test env) — the pattern processor gracefully degrades.
 * If this file passes, a real pipeline test suite is viable.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import { runSinglePass } from '../../test/runSinglePass';

const MOCK_DICTS = {
  characters: { 在: 'ở', 里: 'bên trong', 不: 'không', 知: 'biết', 道: 'đường', 你: 'bạn' },
  phrases: { 不知道: 'không biết' },
  patterns: {},
  properNouns: {},
  conversion: {},
};

function makeToken(value, start) {
  return {
    type: 'chinese_char',
    value,
    translated: null,
    translationSource: null,
    start,
    end: start + value.length,
  };
}

describe('TranslationEngine.translateSinglePass — jsdom spike', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(MOCK_DICTS, { activeProperNouns: [] });
  }, 30_000);

  test('engine initializes without throwing', () => {
    expect(engine).toBeTruthy();
  });

  test('phase 5 — single character falls back to characters dict', async () => {
    const tokens = [makeToken('在', 0)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translationSource).toBe('characters');
    expect(tokens[0].translated).toBe('ở');
  });

  test('phase 4 — 3-char phrase consumed correctly', async () => {
    const tokens = [makeToken('不', 0), makeToken('知', 1), makeToken('道', 2)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translationSource).toBe('phrases');
    expect(tokens[0].translated).toBe('không biết');
    expect(tokens[1].translationSource).toBe('phrases_consumed');
    expect(tokens[1].translated).toBeNull();
    expect(tokens[2].translationSource).toBe('phrases_consumed');
    expect(tokens[2].translated).toBeNull();
  });

  test('phase 4 beats phase 5 — phrase wins over per-char fallback', async () => {
    // '不知道' should be 'không biết' (phrase), not 'không'+'biết'+'đường' (chars)
    const tokens = [makeToken('不', 0), makeToken('知', 1), makeToken('道', 2)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translated).toBe('không biết');
    expect(tokens[0].translationSource).toBe('phrases');
  });
});

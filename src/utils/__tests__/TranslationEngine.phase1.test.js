/**
 * Phase 1 (structural patterns) against the real WASM binary — ADR-004: the pattern phase
 * runs first, so a pattern wins any span a later phase could also claim.
 *
 * The suite setup mocks translation_wasm_core.js with an init that throws, so Phase 1 is a
 * silent no-op elsewhere (TranslationEngine.pipeline.test.js covers phases 2–5). This file
 * undoes that mock and hands the lifecycle the real binary from disk instead of a fetch.
 *
 * The pattern's variable must itself be a proper noun, or a phrase flagged
 * `allowAsPatternVariable`: the variable cache is built only from those, so a bare character
 * or a plain phrase does not bind and the pattern never matches.
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import { runSinglePass } from '../../test/runSinglePass';
import { isWasmPatternProcessorReady } from '../wasm/WasmPatternProcessor.js';

vi.mock('../../wasm/translation_wasm_core.js', async (importOriginal) => await importOriginal());
vi.mock('../wasm/WasmSharedModule', async () => {
  const core = await import('../../wasm/translation_wasm_core.js');
  const fs = await import('fs');
  let loading;
  return {
    loadSharedWasmModule: () =>
      (loading ??= core.default({
        module_or_path: fs.readFileSync('src/wasm/translation_wasm_core_bg.wasm'),
      })),
  };
});

describe('TranslationEngine — phase 1 patterns win over later phases (ADR-004)', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(
      {
        characters: {
          这: '这',
          些: '些',
          朋: 'bằng',
          友: 'hữu',
          书: 'sách',
          籍: 'tịch',
          墨: 'mặc',
          子: 'tử',
        },
        phrases: {
          这些书籍: 'PHRASE_BOOKS',
          书籍: { translation: 'sách vở', allowAsPatternVariable: true },
        },
        patterns: { 这些X: 'những X này', '第#章': 'chương thứ #', '第#名': 'hạng #o' },
        properNouns: { 这些朋友: 'PROPER_FRIENDS', 朋友: 'bạn bè', 墨子: 'Mặc Tử' },
        conversion: {},
      },
      { activeProperNouns: ['properNouns'] }
    );
  }, 60_000);

  test('the real WASM pattern processor initialized (liveness)', () => {
    expect(isWasmPatternProcessorReady()).toBe(true);
  });

  test('a pattern beats a proper noun over the same span', async () => {
    const result = await engine.translateWithSegments('这些朋友');
    expect(result.translatedText).toBe('Những bạn bè này');
  });

  test('a pattern beats a phrase over the same span', async () => {
    const result = await engine.translateWithSegments('这些书籍');
    expect(result.translatedText).toBe('Những sách vở này');
  });

  test('a pattern match keeps the consumed-token contract across the WASM boundary', async () => {
    const tokens = [...'这些朋友'].map((value, i) => ({
      type: 'chinese_char',
      value,
      translated: null,
      translationSource: null,
      start: i,
      end: i + 1,
    }));
    await runSinglePass(engine, tokens, {});

    const [leader, ...followers] = tokens;
    expect(leader.translated).toBe('những bạn bè này');
    expect(leader.translationSource).toBe('hierarchical_patterns');
    expect(followers).toHaveLength(3);
    for (const follower of followers) {
      expect(follower.translated).toBeNull();
      expect(follower.translationSource).toBe('hierarchical_patterns_consumed');
      expect(follower.groupLeader).toBe(0);
    }
  });
  // A `#` variable takes a numeral of up to 8 characters on both pattern paths. The Rust matcher
  // capped every variable at 6, so a heading with a 7-character numeral fell to characters.
  test('a # variable binds a 6-character numeral', async () => {
    const result = await engine.translateWithSegments('第一千二百三十章');
    expect(result.translatedText).toBe('Chương thứ 1,230');
  });

  test('a # variable binds a 7-character numeral', async () => {
    const result = await engine.translateWithSegments('第一千二百三十四章');
    expect(result.translatedText).toBe('Chương thứ 1,234');
  });

  // `#o` in a template is the ordinal reading: Vietnamese says "nhất"/"tư" for 1st/4th, not "một"/"bốn".
  test('#o reads 1 and 4 as ordinals and every other number as its cardinal', async () => {
    const read = async (text) => (await engine.translateWithSegments(text)).translatedText;
    expect(await read('第一名')).toBe('Hạng nhất');
    expect(await read('第四名')).toBe('Hạng tư');
    expect(await read('第二名')).toBe('Hạng hai');
    expect(await read('第十四名')).toBe('Hạng 14');
  });

  // A proper noun matches across the space in "墨 子"; the match must claim the space and 子 too.
  // It claimed only as many tokens as it matched, so 子 was left for Phase 5: "Mặc Tử tử".
  test('a proper noun matched across a space consumes every token it spans', async () => {
    const result = await engine.translateWithSegments('墨 子');
    expect(result.translatedText).toBe('Mặc Tử');
  });
});

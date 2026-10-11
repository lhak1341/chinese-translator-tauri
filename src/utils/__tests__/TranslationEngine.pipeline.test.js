/**
 * Pipeline tests for TranslationEngine.translateSinglePass.
 *
 * Covers the four pure-JS phases testable in jsdom:
 *   Phase 2 — proper nouns  (JS trie lookup, no WASM dependency)
 *   Phase 3 — numbers       (JS NumberProcessor)
 *   Phase 4 — phrases       (JS trie lookup, no WASM dependency)
 *   Phase 5 — character fallback (JS trie lookup)
 *
 * Phase 1 (WASM structural patterns) does nothing without the WASM binary — see
 * TranslationEngine.phase1.test.js, which loads the real one.
 * Pre-marked token tests below simulate Phase 1 output to verify Phase 4/5 guards.
 * 'phase order' asserts ADR-004: the run order, and that an earlier phase wins a shared span.
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { createTranslationEngine } from '../TranslationEngine.js';
import { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder.js';
import { runSinglePass } from '../../test/runSinglePass';

const DICTS = {
  characters: {
    在: 'ở',
    里: 'bên trong',
    不: 'không',
    知: 'biết',
    道: 'đường',
    你: 'bạn',
    好: 'tốt',
    张: 'Trương',
    三: 'Ba',
    是: 'là',
    中: 'trung',
    国: 'quốc',
    人: 'người',
    日: 'nhật',
  },
  phrases: {
    不知道: 'không biết',
    你好: 'xin chào',
    中国人: 'người Trung Quốc',
    张三: 'PHRASE_张三', // also in properNouns — proper noun must win
  },
  patterns: {},
  properNouns: {
    张三: 'Trương Tam',
    日元: 'Yên Nhật',
    元始圣人: 'Nguyên Thủy Thánh Nhân',
  },
  conversion: {},
};

function tok(value, start, type = 'chinese_char') {
  return {
    type,
    value,
    translated: null,
    translationSource: null,
    start,
    end: start + value.length,
  };
}

describe('TranslationEngine.translateSinglePass — pipeline', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(DICTS, { activeProperNouns: ['properNouns'] });
  }, 30_000);

  // ── Phase 5: character fallback ────────────────────────────────────────────

  describe('Phase 5 — character fallback', () => {
    test('single char → translationSource characters', async () => {
      const tokens = [tok('在', 0)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translationSource).toBe('characters');
      expect(tokens[0].translated).toBe('ở');
    });

    test('two independent chars → each translated separately', async () => {
      const tokens = [tok('在', 0), tok('里', 1)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('ở');
      expect(tokens[0].translationSource).toBe('characters');
      expect(tokens[1].translated).toBe('bên trong');
      expect(tokens[1].translationSource).toBe('characters');
    });

    test('a token no dictionary knows stays untranslated, and a stamped one is left alone', async () => {
      const stamped = { ...tok('在', 1), translated: 'PRE', translationSource: 'patterns' };
      const tokens = [tok('龘', 0), stamped];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBeNull();
      expect(tokens[1].translated).toBe('PRE');
      expect(tokens[1].translationSource).toBe('patterns');
    });
  });

  // ── Phase 4: phrase lookup ─────────────────────────────────────────────────

  describe('Phase 4 — phrase lookup', () => {
    test('2-char phrase: leader translated, consumed null', async () => {
      const tokens = [tok('你', 0), tok('好', 1)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('xin chào');
      expect(tokens[0].translationSource).toBe('phrases');
      expect(tokens[1].translated).toBeNull();
      expect(tokens[1].translationSource).toBe('phrases_consumed');
    });

    test('3-char phrase: two consumed tokens', async () => {
      const tokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('không biết');
      expect(tokens[0].translationSource).toBe('phrases');
      expect(tokens[1].translated).toBeNull();
      expect(tokens[1].translationSource).toBe('phrases_consumed');
      expect(tokens[2].translated).toBeNull();
      expect(tokens[2].translationSource).toBe('phrases_consumed');
    });

    test('phrase grouping: leader isGrouped, consumed have groupLeader index', async () => {
      const tokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].isGrouped).toBe(true);
      expect(tokens[1].isGrouped).toBe(true);
      expect(tokens[1].groupLeader).toBe(0);
      expect(tokens[2].isGrouped).toBe(true);
      expect(tokens[2].groupLeader).toBe(0);
    });

    test('phrase then lone char: phrase handles first tokens, char handles remainder', async () => {
      const tokens = [tok('你', 0), tok('好', 1), tok('在', 2)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translationSource).toBe('phrases');
      expect(tokens[1].translationSource).toBe('phrases_consumed');
      expect(tokens[2].translationSource).toBe('characters');
      expect(tokens[2].translated).toBe('ở');
    });

    test('phrase beats char: 中国人 as phrase, not 3 individual chars', async () => {
      const tokens = [tok('中', 0), tok('国', 1), tok('人', 2)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('người Trung Quốc');
      expect(tokens[0].translationSource).toBe('phrases');
      expect(tokens[1].translated).toBeNull();
      expect(tokens[2].translated).toBeNull();
    });
  });

  // ── Phase 2: proper nouns ──────────────────────────────────────────────────

  describe('Phase 2 — proper noun lookup', () => {
    test('2-char proper noun: translated, isProperNoun true', async () => {
      const tokens = [tok('张', 0), tok('三', 1)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('Trương Tam');
      expect(tokens[0].translationSource).toBe('properNouns');
      expect(tokens[0].isProperNoun).toBe(true);
    });

    test('2-char proper noun: consumed token has _consumed source, null translated', async () => {
      const tokens = [tok('张', 0), tok('三', 1)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[1].translated).toBeNull();
      expect(tokens[1].translationSource).toBe('properNouns_consumed');
    });

    test('proper noun beats phrase when same text is in both dicts', async () => {
      // 张三 is in both properNouns ('Trương Tam') and phrases ('PHRASE_张三')
      // Phase 2 runs before Phase 4 — proper noun must win
      const tokens = [tok('张', 0), tok('三', 1)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translationSource).toBe('properNouns');
      expect(tokens[0].translated).toBe('Trương Tam');
    });

    test('proper noun + trailing char: both phases resolve their tokens', async () => {
      const tokens = [tok('张', 0), tok('三', 1), tok('是', 2)];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translationSource).toBe('properNouns');
      expect(tokens[1].translationSource).toBe('properNouns_consumed');
      expect(tokens[2].translationSource).toBe('characters');
      expect(tokens[2].translated).toBe('là');
    });

    test('lookahead defers a short match when a longer match starts inside its span', async () => {
      // 日元 (2 chars, i=0) would greedily match first, but 元始圣人 (4 chars) starts
      // at i=1 — strictly longer, so the short match at i=0 must defer. See
      // src/utils/CLAUDE.md "Phase 2 Proper Noun Lookahead".
      const tokens = [tok('日', 0), tok('元', 1), tok('始', 2), tok('圣', 3), tok('人', 4)];
      await runSinglePass(engine, tokens, {});

      // 日元 never wins — 日 falls through to Phase 5 character fallback instead.
      expect(tokens[0].translationSource).toBe('characters');
      expect(tokens[0].translated).toBe('nhật');

      // 元始圣人 wins the deferred position, consuming all 4 remaining tokens.
      expect(tokens[1].translationSource).toBe('properNouns');
      expect(tokens[1].translated).toBe('Nguyên Thủy Thánh Nhân');
      expect(tokens[2].translationSource).toBe('properNouns_consumed');
      expect(tokens[3].translationSource).toBe('properNouns_consumed');
      expect(tokens[4].translationSource).toBe('properNouns_consumed');
      expect(tokens[2].translated).toBeNull();
      expect(tokens[3].translated).toBeNull();
      expect(tokens[4].translated).toBeNull();
    });
  });

  // ── Pre-marked tokens (Phase 1 simulation) ────────────────────────────────

  describe('pre-marked tokens — Phase 1 simulation', () => {
    test('pattern-marked token: Phase 4 does not overwrite it', async () => {
      const tokens = [
        { ...tok('不', 0), translated: 'PATTERN_RESULT', translationSource: 'pattern' },
        tok('知', 1),
        tok('道', 2),
      ];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('PATTERN_RESULT');
      expect(tokens[0].translationSource).toBe('pattern');
    });

    test('pattern-marked token: Phase 5 does not overwrite it', async () => {
      const tokens = [
        { ...tok('在', 0), translated: 'PATTERN_RESULT', translationSource: 'pattern' },
      ];
      await runSinglePass(engine, tokens, {});
      expect(tokens[0].translated).toBe('PATTERN_RESULT');
      expect(tokens[0].translationSource).toBe('pattern');
    });
  });

  // ── Consumed token contract ────────────────────────────────────────────────

  describe('consumed token contract', () => {
    test('consumed tokens always have null translated', async () => {
      const tokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
      await runSinglePass(engine, tokens, {});
      const consumed = tokens.filter((t) => t.translationSource?.includes('_consumed'));
      expect(consumed.length).toBeGreaterThan(0);
      expect(consumed.every((t) => t.translated === null)).toBe(true);
    });

    test('non-consumed tokens always have non-null translated', async () => {
      const tokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
      await runSinglePass(engine, tokens, {});
      const leaders = tokens.filter((t) => !t.translationSource?.includes('_consumed'));
      expect(leaders.every((t) => t.translated !== null)).toBe(true);
    });

    test('_consumed suffix consistent across phrase and proper noun phases', async () => {
      const phraseTokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
      await runSinglePass(engine, phraseTokens, {});
      const phraseConsumed = phraseTokens.filter((t) => t.translationSource?.includes('_consumed'));
      expect(phraseConsumed.every((t) => t.translationSource.endsWith('_consumed'))).toBe(true);
      expect(phraseConsumed.every((t) => t.translated === null)).toBe(true);

      const nounTokens = [tok('张', 0), tok('三', 1)];
      await runSinglePass(engine, nounTokens, {});
      expect(nounTokens[1].translationSource).toMatch(/_consumed$/);
      expect(nounTokens[1].translated).toBeNull();
    });
  });
});

describe('TranslationEngine.translateSinglePass — phase order (ADR-004)', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(
      {
        characters: { 三: 'ba', 十: 'mười', 五: 'năm', 我: 'tôi' },
        phrases: { 三十: 'PHRASE_30' },
        patterns: {},
        properNouns: { 三十五: 'PROPER_35' },
        conversion: {},
      },
      { activeProperNouns: ['properNouns'] }
    );
  }, 30_000);

  const sources = (tokens) => tokens.map((t) => t.translationSource);

  test('runs Pattern, Proper Noun, Number, Phrase, Character, inside the total', async () => {
    const profile = vi.spyOn(engine.phaseProfiler, 'profile');
    try {
      await runSinglePass(engine, [tok('我', 0)], {});
      expect(profile.mock.calls.map(([phase]) => phase)).toEqual([
        'total',
        'patterns',
        'properNouns',
        'numbers',
        'phrases',
        'characters',
      ]);
    } finally {
      profile.mockRestore();
    }
  });

  test('number beats phrase over the same span', async () => {
    const tokens = [tok('三', 0), tok('十', 1)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translated).toBe('30');
    expect(sources(tokens)).toEqual(['number_conversion', 'number_conversion_consumed']);
  });

  test('number beats character fallback', async () => {
    const tokens = [tok('我', 0), tok('五', 1), tok('十', 2)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translationSource).toBe('characters');
    expect(tokens[1].translated).toBe('50');
    expect(tokens[1].translationSource).toBe('number_conversion');
  });

  test('proper noun beats number over the same span', async () => {
    const tokens = [tok('三', 0), tok('十', 1), tok('五', 2)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translated).toBe('PROPER_35');
    expect(sources(tokens)).toEqual([
      'properNouns',
      'properNouns_consumed',
      'properNouns_consumed',
    ]);
  });
});

describe('TranslationEngine.translateSinglePass — phrases over a whole chunk', () => {
  // Phrase lookup used to take a separate path above 10 tokens, which no test reached: every
  // fixture above is shorter. A real chunk is always longer.
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(
      {
        characters: { 我: 'tôi' },
        phrases: { 中国: 'TQ', 中国人: 'người TQ', 国人: 'quốc nhân' },
        patterns: {},
        properNouns: {},
        conversion: {},
      },
      { activeProperNouns: [] }
    );
  }, 30_000);

  const chunk = () => [...'我我中国人我我国人我中国我'].map((value, i) => tok(value, i));

  test('a chunk longer than 10 tokens still gets its phrases applied', async () => {
    const tokens = chunk();
    expect(tokens.length).toBeGreaterThan(10);
    await runSinglePass(engine, tokens, {});
    expect(tokens.map((t) => t.translationSource)).toEqual([
      'characters',
      'characters',
      'phrases',
      'phrases_consumed',
      'phrases_consumed',
      'characters',
      'characters',
      'phrases',
      'phrases_consumed',
      'characters',
      'phrases',
      'phrases_consumed',
      'characters',
    ]);
  });

  test('the longest phrase wins where phrases overlap', async () => {
    const tokens = chunk();
    await runSinglePass(engine, tokens, {});
    expect(tokens[2].translated).toBe('người TQ'); // 中国人, not 中国 or 国人
    expect(tokens[7].translated).toBe('quốc nhân'); // 国人 alone
    expect(tokens[10].translated).toBe('TQ'); // 中国 alone
  });

  test("chunkOffset shifts the phrases' semantic-unit token indices", async () => {
    const tokens = chunk();
    engine.semanticArrayBuilder = new SemanticArrayBuilder();
    await runSinglePass(engine, tokens, { chunkOffset: 7 });
    const phraseUnits = engine.semanticArrayBuilder
      .getArrays()
      .metadata.filter((unit) => ['中国人', '国人', '中国'].includes(unit.originalText));
    expect(phraseUnits.map((unit) => [unit.originalText, unit.tokenIndex])).toEqual([
      ['中国人', 9],
      ['国人', 14],
      ['中国', 17],
    ]);
  });
});

describe('TranslationEngine.initialize — which dictionaries it loads', () => {
  // The caller hands over every dictionary; the engine keeps what filterDictionariesForEngine
  // keeps for activeProperNouns (its own rules: FictionDictionaryFilter.test.ts).
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(
      {
        characters: { 李: 'lý', 四: 'bốn', 王: 'vương', 五: 'năm' },
        phrases: {},
        patterns: {},
        properNouns: {},
        'properNouns-f_Novel': { 王五: 'Vương Ngũ' },
        'properNouns-f_Other': { 李四: 'Lý Tứ' },
        conversion: {},
      },
      { activeProperNouns: ['properNouns', 'properNouns-f_Novel'] }
    );
  }, 30_000);

  test('an active proper-noun dictionary translates its names', async () => {
    const tokens = [tok('王', 0), tok('五', 1)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translated).toBe('Vương Ngũ');
  });

  test('an inactive proper-noun dictionary is left out, so its names fall to characters', async () => {
    const tokens = [tok('李', 0), tok('四', 1)];
    await runSinglePass(engine, tokens, {});
    expect(tokens[0].translated).toBe('lý');
    expect(tokens[1].translated).toBe('bốn');
    expect(engine.lastLoadedDictionaries).not.toHaveProperty('properNouns-f_Other');
  });
});

/**
 * Pins the token state each phase leaves behind: leader and followers, field by field.
 *
 * The consumed-token contract (`*_consumed` → `translated: null`, a leader has a ranked source)
 * is written by several phases, in two shapes. The light shape (Phase 1, Phase 3) sets
 * `translated`, `translationSource` and `groupLeader` on the followers and nothing else, so a
 * Phase 1 pattern leader has no `isGrouped`/`groupedWith`. The grouped shape (Phase 2, Phase 4)
 * adds `isGrouped`, `originalValue`, `groupedWith` and rewrites the leader's `value`.
 *
 * Each case lists only the fields that are set. `toStrictEqual` makes a field that appears or
 * disappears fail, which is what an equal-looking refactor of these writers would change.
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { createTranslationEngine, TranslationEngine } from '../TranslationEngine.js';

const DICTS = {
  characters: {
    在: 'ở',
    里: 'bên trong',
    不: 'không',
    知: 'biết',
    道: 'đường',
    三: 'ba',
    十: 'mười',
  },
  phrases: { 不知道: 'không biết' },
  patterns: {},
  properNouns: { 张三: 'Trương Tam' },
  conversion: {},
};

const FIELDS = [
  'value',
  'end',
  'translated',
  'translationSource',
  'groupLeader',
  'isGrouped',
  'groupedWith',
  'originalValue',
  'isProperNoun',
];

/** The contract-relevant fields of a token, leaving out any that are undefined. */
function state(token) {
  const out = {};
  for (const field of FIELDS) if (token[field] !== undefined) out[field] = token[field];
  return out;
}

function tok(value, start) {
  return {
    type: 'chinese_char',
    value,
    translated: null,
    translationSource: null,
    start,
    end: start + value.length,
  };
}

describe('token state per phase', () => {
  let engine;

  beforeAll(async () => {
    engine = createTranslationEngine();
    await engine.initialize(DICTS, { activeProperNouns: ['properNouns'] });
  }, 30_000);

  test('Phase 1, a three-token pattern: followers carry groupLeader only', () => {
    const tokens = ['不', '知', '道', '在'].map((v, i) => tok(v, i));
    const stub = { semanticArrayBuilder: { addUnit: vi.fn() } };
    TranslationEngine.prototype.applyHierarchicalResults.call(
      stub,
      tokens,
      [
        {
          startIndex: 0,
          endIndex: 2,
          translation: 'PAT',
          semanticType: 'concept',
          translationSource: 'pattern',
          type: 'simple',
        },
      ],
      {}
    );
    expect(tokens.map(state)).toStrictEqual([
      {
        value: '不',
        end: 1,
        translated: 'PAT',
        translationSource: 'pattern',
      },
      {
        value: '知',
        end: 2,
        translated: null,
        translationSource: 'pattern_consumed',
        groupLeader: 0,
      },
      {
        value: '道',
        end: 3,
        translated: null,
        translationSource: 'pattern_consumed',
        groupLeader: 0,
      },
      { value: '在', end: 4, translated: null, translationSource: null },
    ]);
  });

  test('Phase 1, a WASM-named source: the follower source derives from the leader source', () => {
    const tokens = ['不', '知'].map((v, i) => tok(v, i));
    const stub = { semanticArrayBuilder: { addUnit: vi.fn() } };
    TranslationEngine.prototype.applyHierarchicalResults.call(
      stub,
      tokens,
      [
        {
          startIndex: 0,
          endIndex: 1,
          translation: 'PAT',
          translationSource: 'hierarchical_pattern',
        },
      ],
      {}
    );
    expect(tokens.map(state)).toStrictEqual([
      {
        value: '不',
        end: 1,
        translated: 'PAT',
        translationSource: 'hierarchical_pattern',
      },
      {
        value: '知',
        end: 2,
        translated: null,
        translationSource: 'hierarchical_pattern_consumed',
        groupLeader: 0,
      },
    ]);
  });

  test('Phase 2, a proper noun: grouped shape, leader end moves to the last token', async () => {
    const tokens = [tok('张', 0), tok('三', 1)];
    await engine.translateSinglePass(tokens, {});
    expect(tokens.map(state)).toStrictEqual([
      {
        value: '张三',
        end: 2,
        translated: 'Trương Tam',
        translationSource: 'properNouns',
        isGrouped: true,
        groupedWith: [1],
        originalValue: '张',
        isProperNoun: true,
      },
      {
        value: '三',
        end: 2,
        translated: null,
        translationSource: 'properNouns_consumed',
        groupLeader: 0,
        isGrouped: true,
        originalValue: '三',
      },
    ]);
  });

  test('Phase 2 over a Phase 1 leader: followers outside the new span are released', () => {
    // [张, 三(pattern leader), 里, 在 (its followers)]: the proper noun 张三 takes 0-1.
    const tokens = [tok('张', 0), tok('三', 1), tok('里', 2), tok('在', 3)];
    tokens[1].translated = 'PAT';
    tokens[1].translationSource = 'pattern';
    for (const i of [2, 3]) {
      tokens[i].translated = null;
      tokens[i].translationSource = 'pattern_consumed';
      tokens[i].groupLeader = 1;
    }
    engine.applyMatchToTokens(
      tokens,
      0,
      { word: '张三', translation: 'Trương Tam', dictionary: 'properNouns' },
      {}
    );
    expect(tokens.map(state)).toStrictEqual([
      {
        value: '张三',
        end: 2,
        translated: 'Trương Tam',
        translationSource: 'properNouns',
        isGrouped: true,
        groupedWith: [1],
        originalValue: '张',
        isProperNoun: true,
      },
      {
        value: '三',
        end: 2,
        translated: null,
        translationSource: 'properNouns_consumed',
        groupLeader: 0,
        isGrouped: true,
        originalValue: '三',
      },
      {
        value: '里',
        end: 3,
        translated: null,
        translationSource: null,
        groupLeader: null,
        isGrouped: false,
      },
      {
        value: '在',
        end: 4,
        translated: null,
        translationSource: null,
        groupLeader: null,
        isGrouped: false,
      },
    ]);
  });

  test('Phase 3, a number: light shape, no isGrouped', async () => {
    const tokens = [tok('三', 0), tok('十', 1), tok('在', 2)];
    await engine.translateSinglePass(tokens, {});
    expect(tokens.map(state)).toStrictEqual([
      { value: '三', end: 1, translated: '30', translationSource: 'number_conversion' },
      {
        value: '十',
        end: 2,
        translated: null,
        translationSource: 'number_conversion_consumed',
        groupLeader: 0,
      },
      { value: '在', end: 3, translated: 'ở', translationSource: 'characters' },
    ]);
  });

  test('Phase 4, a phrase: grouped shape, same as Phase 2: leader end moves to the last token', async () => {
    const tokens = [tok('不', 0), tok('知', 1), tok('道', 2)];
    await engine.translateSinglePass(tokens, {});
    expect(tokens.map(state)).toStrictEqual([
      {
        value: '不知道',
        end: 3,
        translated: 'không biết',
        translationSource: 'phrases',
        isGrouped: true,
        groupedWith: [1, 2],
        originalValue: '不',
      },
      {
        value: '知',
        end: 2,
        translated: null,
        translationSource: 'phrases_consumed',
        groupLeader: 0,
        isGrouped: true,
        originalValue: '知',
      },
      {
        value: '道',
        end: 3,
        translated: null,
        translationSource: 'phrases_consumed',
        groupLeader: 0,
        isGrouped: true,
        originalValue: '道',
      },
    ]);
  });

  test('Phase 5, one character: a plain leader', async () => {
    const tokens = [tok('里', 0)];
    await engine.translateSinglePass(tokens, {});
    expect(tokens.map(state)).toStrictEqual([
      { value: '里', end: 1, translated: 'bên trong', translationSource: 'characters' },
    ]);
  });
});

import { describe, test, expect } from 'vitest';
import {
  planAdd,
  planUpdate,
  planDelete,
  planMove,
  invert,
  applyEdit,
  changedKeys,
  sameEntryValue,
  isInvalidPlan,
  touchedDictionaries,
} from '../dictionary/DictionaryEdit';
import type { Dictionaries, DictionaryEdit, PlanResult } from '../dictionary/DictionaryEdit';

const A = 'properNouns-A';
const B = 'properNouns-B';

function entry(translation: string, extra: Record<string, unknown> = {}) {
  return { translation, allowAsPatternVariable: false, ...extra };
}

function dicts(): Dictionaries {
  return {
    [A]: { 张三: entry('Trương Tam'), 李四: entry('Lý Tứ') },
    [B]: { 张三: entry('Trương Tam (B)'), 王五: entry('Vương Ngũ') },
    characters: { 我: 'ta' },
  };
}

function edit(result: PlanResult): DictionaryEdit {
  if (isInvalidPlan(result)) throw new Error(`unexpected invalid plan: ${result.invalid}`);
  return result;
}

// Every plan type, including each overwrite case the old history records lost.
const plans: Array<[string, (d: Dictionaries) => PlanResult]> = [
  ['add new key', (d) => planAdd(d, A, '赵六', entry('Triệu Lục'))],
  ['add over existing key', (d) => planAdd(d, A, '张三', entry('Trương Tam mới'))],
  ['add to a lookup table', (d) => planAdd(d, 'characters', '你', 'ngươi')],
  ['update in place', (d) => planUpdate(d, A, '张三', '张三', entry('Trương Tam 2'))],
  ['update renamed to a free key', (d) => planUpdate(d, A, '李四', '赵六', entry('Lý Tứ'))],
  ['update renamed onto an existing key', (d) => planUpdate(d, A, '李四', '张三', entry('Lý Tứ'))],
  ['delete one', (d) => planDelete(d, A, ['张三'])],
  ['delete several, one missing', (d) => planDelete(d, A, ['张三', '李四', '无'])],
  ['move to a free key', (d) => planMove(d, A, B, ['李四'])],
  ['move onto an existing key', (d) => planMove(d, A, B, ['张三'])],
  ['move several', (d) => planMove(d, A, B, ['张三', '李四', '无'])],
];

describe('DictionaryEdit — undo restores the dictionaries exactly', () => {
  test.each(plans)('%s', (_name, plan) => {
    const before = dicts();
    const e = edit(plan(before));
    const after = applyEdit(before, e);

    expect(changedKeys(e, before)).toEqual([]);
    expect(changedKeys(invert(e), after)).toEqual([]);
    expect(applyEdit(after, invert(e))).toEqual(before);
    // Redo is the edit itself, from the undone state.
    expect(applyEdit(applyEdit(after, invert(e)), e)).toEqual(after);
  });

  test('applyEdit leaves its input untouched', () => {
    const before = dicts();
    const snapshot = structuredClone(before);
    applyEdit(before, edit(planMove(before, A, B, ['张三'])));
    expect(before).toEqual(snapshot);
  });
});

describe('DictionaryEdit — plans', () => {
  test('add reports added vs overwritten', () => {
    expect(edit(planAdd(dicts(), A, '赵六', entry('x'))).outcome).toEqual({ kind: 'added' });
    expect(edit(planAdd(dicts(), A, '张三', entry('x'))).outcome).toEqual({
      kind: 'overwritten',
    });
  });

  test('delete and move report counts and missing keys', () => {
    expect(edit(planDelete(dicts(), A, ['张三', '无'])).outcome).toEqual({
      kind: 'deleted',
      count: 1,
      missing: ['无'],
    });
    expect(edit(planMove(dicts(), A, B, ['张三', '李四', '无'])).outcome).toEqual({
      kind: 'moved',
      count: 2,
      missing: ['无'],
    });
  });

  test('a move touches source then target', () => {
    expect(touchedDictionaries(edit(planMove(dicts(), A, B, ['张三'])))).toEqual([A, B]);
  });

  test('invalid requests', () => {
    expect(planAdd(dicts(), 'properNouns-X', 'k', entry('v'))).toEqual({
      invalid: "Dictionary 'properNouns-X' does not exist",
      missingDictionaryId: 'properNouns-X',
    });
    expect(planMove(dicts(), 'properNouns-X', B, ['k'])).toEqual({
      invalid: "Source dictionary 'properNouns-X' does not exist",
      missingDictionaryId: 'properNouns-X',
    });
    expect(planMove(dicts(), A, 'properNouns-X', ['k'])).toEqual({
      invalid: "Target dictionary 'properNouns-X' does not exist",
      missingDictionaryId: 'properNouns-X',
    });
    expect(isInvalidPlan(planMove(dicts(), A, 'characters', ['张三']))).toBe(true);
    expect(isInvalidPlan(planMove(dicts(), A, A, ['张三']))).toBe(true);
  });
});

describe('DictionaryEdit — changedKeys', () => {
  test('names a key another edit changed since', () => {
    const before = dicts();
    const e = edit(planAdd(before, A, '张三', entry('Trương Tam mới')));
    const after = applyEdit(before, e);
    const drifted = { ...after, [A]: { ...after[A], 张三: entry('someone else') } };

    expect(changedKeys(invert(e), drifted)).toEqual(['张三']);
  });

  test('a missing dictionary counts as changed', () => {
    const e = edit(planAdd(dicts(), A, '张三', entry('x')));
    const withoutA: Dictionaries = { ...dicts() };
    delete withoutA[A];
    expect(changedKeys(e, withoutA)).toEqual(['张三']);
  });
});

describe('DictionaryEdit — sameEntryValue', () => {
  test('compares fields, not references', () => {
    expect(sameEntryValue(entry('a'), entry('a'))).toBe(true);
    expect(sameEntryValue(entry('a'), entry('b'))).toBe(false);
    expect(
      sameEntryValue(
        entry('a', { allowedVariableTypes: { X: ['character'] } }),
        entry('a', { allowedVariableTypes: { X: ['character'] } })
      )
    ).toBe(true);
    expect(
      sameEntryValue(
        entry('a', { allowedVariableTypes: { X: ['character'] } }),
        entry('a', { allowedVariableTypes: { X: ['location'] } })
      )
    ).toBe(false);
    expect(sameEntryValue(entry('a', { semanticType: 'character' }), entry('a'))).toBe(false);
  });

  test('absent defaults equal their explicit empty form', () => {
    expect(sameEntryValue({ translation: 'a' }, entry('a', { semanticType: '' }))).toBe(true);
  });

  test('string and object values differ; undefined only equals undefined', () => {
    expect(sameEntryValue('a', 'a')).toBe(true);
    expect(sameEntryValue('a', entry('a'))).toBe(false);
    expect(sameEntryValue(undefined, undefined)).toBe(true);
    expect(sameEntryValue(undefined, 'a')).toBe(false);
  });
});

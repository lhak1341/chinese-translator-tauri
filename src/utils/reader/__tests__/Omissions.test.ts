import { describe, expect, test } from 'vitest';
import {
  compileOmissions,
  normalizeOmissions,
  parseOmissionsText,
  sameOmissions,
} from '../Omissions';

// Shapes taken from the library: 焚尽八荒 carries the first string 434 times, alone on a
// line, at a line's end and inside a word; 诛仙 the spaced-out site name.
const BRAND = '@黄色小说/class12/1.html';
const indent = String.fromCodePoint(0x3000).repeat(2);

describe('compileOmissions', () => {
  const omit = compileOmissions([BRAND]);

  test('removes the text inside a word, leaving the word whole', () => {
    expect(omit('同时还能将自己的念头反' + BRAND + '馈到你的脑海里')).toBe(
      '同时还能将自己的念头反馈到你的脑海里'
    );
  });

  test('removes every occurrence on the line', () => {
    expect(omit(BRAND + '“密码' + BRAND + '解析”')).toBe('“密码解析”');
  });

  test('a line that held only omitted text and its indent becomes a blank line', () => {
    expect(omit(indent + BRAND)).toBe('');
  });

  test('a line nothing matched comes back as it was, indent included', () => {
    expect(omit(indent + '赶路，遭遇魔兽')).toBe(indent + '赶路，遭遇魔兽');
    expect(omit(indent)).toBe(indent);
  });

  test('keeps the indent of a line whose text survives', () => {
    expect(omit(indent + BRAND + '“到了，辉煌酒店。”')).toBe(indent + '“到了，辉煌酒店。”');
  });

  test('regular-expression characters in an omission match literally', () => {
    const spaced = compileOmissions(['八零电子书[www.t x t 80 .c o m]']);
    expect(spaced('八零电子书[www.t x t 80 .c o m]')).toBe('');
    expect(spaced('八零电子书wwwXt x t 80 .c o m')).toBe('八零电子书wwwXt x t 80 .c o m');
  });

  test('where two omissions start at the same place the longer one wins', () => {
    const both = compileOmissions(['本站', '本站已开通wap浏览功能']);
    expect(both('他说本站已开通wap浏览功能，好')).toBe('他说，好');
  });

  test('matching is exact: case and full-width forms are different text', () => {
    const exact = compileOmissions(['CoM']);
    expect(exact('txt80.com')).toBe('txt80.com');
    expect(exact('txt80.ＣoＭ')).toBe('txt80.ＣoＭ');
  });

  test('no omissions changes nothing', () => {
    expect(compileOmissions([])(indent + BRAND)).toBe(indent + BRAND);
  });
});

describe('the stored list', () => {
  test('is trimmed, without empty lines or duplicates, in the order written', () => {
    expect(normalizeOmissions([' b ', '', 'a', 'b', '   '])).toEqual(['b', 'a']);
    expect(parseOmissionsText(BRAND + '\r\n\n八零电子书\n')).toEqual([BRAND, '八零电子书']);
  });

  test('two lists are the same when they hold the same strings, in any order', () => {
    expect(sameOmissions(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameOmissions(['a'], ['a', 'b'])).toBe(false);
    expect(sameOmissions(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});

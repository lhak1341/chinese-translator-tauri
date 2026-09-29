import { describe, expect, test } from 'vitest';
import { CHAPTER_PATTERN_IDS } from '../ReaderTypes';
import fixture from '../../../test-fixtures/chapter-pattern-ids.json';

describe('CHAPTER_PATTERN_IDS', () => {
  test("is Rust's PatternId list, in PATTERN_ORDER (test-fixtures/chapter-pattern-ids.json)", () => {
    expect([...CHAPTER_PATTERN_IDS]).toEqual(fixture.ids);
  });
});

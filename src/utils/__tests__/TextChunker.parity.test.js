/**
 * Chunker fixture check (architecture review 2026-10-03, candidate #3 grilling).
 * test-fixtures/chunker-parity.json is the source of truth for what TextChunker.js produces for
 * a given input. The Rust twin was deleted 2026-10-06 (ADR-079), so the fixture now feeds this
 * file alone.
 */
import { describe, test, expect } from 'vitest';
import { TextChunker } from '../text/TextChunker.js';
import fixture from '../../../test-fixtures/chunker-parity.json';

// startIndex of a chunk with empty content is unspecified (see the fixture's _contract):
// the fixture holds null for it, so only a chunk with content is compared on it.
const toPlain = (chunks) =>
  chunks.map(({ content, punctuation, startIndex, lineBreaks, startedBy }) => ({
    content,
    punctuation,
    startIndex: content === '' ? null : startIndex,
    lineBreaks,
    startedBy,
  }));

describe('TextChunker — fixture', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', ({ input, expected }) => {
    const chunker = new TextChunker();

    expect(toPlain(chunker.chunkText(input))).toEqual(expected);
  });
});

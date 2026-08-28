/**
 * Tests for buildEntryMetadata — the single metadata-shape builder shared by
 * VirtualRowComponent's text-edit path, useEntryMetadataEdit's badge/toggle handlers, and
 * useDictionaryEntryForm's submit handler (architecture review 2026-08-28, candidate #3
 * grilling). No dictionary-type gate — prepareMutationEntry (useDictionaryCRUD.ts) is the
 * sole real authority on whether metadata is kept, discarding it for non-complex dicts
 * regardless of shape.
 */

import { describe, test, expect } from 'vitest';
import { buildEntryMetadata } from '../dictionary/EntryMetadataBuilder';

describe('buildEntryMetadata', () => {
  test('always includes allowAsPatternVariable, even when false', () => {
    const metadata = buildEntryMetadata({ allowAsPatternVariable: false });
    expect(metadata).toEqual({ allowAsPatternVariable: false });
  });

  test('includes allowAsPatternVariable: true', () => {
    const metadata = buildEntryMetadata({ allowAsPatternVariable: true });
    expect(metadata.allowAsPatternVariable).toBe(true);
  });

  test('omits semanticType when empty string', () => {
    const metadata = buildEntryMetadata({ allowAsPatternVariable: false, semanticType: '' });
    expect(metadata).not.toHaveProperty('semanticType');
  });

  test('includes semanticType when set', () => {
    const metadata = buildEntryMetadata({
      allowAsPatternVariable: false,
      semanticType: 'character',
    });
    expect(metadata.semanticType).toBe('character');
  });

  test('omits allowedVariableTypes when undefined', () => {
    const metadata = buildEntryMetadata({ allowAsPatternVariable: false });
    expect(metadata).not.toHaveProperty('allowedVariableTypes');
  });

  test('omits allowedVariableTypes when an empty object', () => {
    const metadata = buildEntryMetadata({
      allowAsPatternVariable: false,
      allowedVariableTypes: {},
    });
    expect(metadata).not.toHaveProperty('allowedVariableTypes');
  });

  test('includes allowedVariableTypes when non-empty', () => {
    const metadata = buildEntryMetadata({
      allowAsPatternVariable: true,
      allowedVariableTypes: { X: ['character'] },
    });
    expect(metadata.allowedVariableTypes).toEqual({ X: ['character'] });
  });

  test('builds the full shape unconditionally regardless of dictionary type — no gate', () => {
    // The old per-call-site gates (isPatterns||isPhrases||isProperNouns / raw dictionaryId
    // check) are gone; this function has no dictionary-type awareness at all. Callers that
    // write to a pure lookup-table dict (characters/conversion/punctuation) still get the
    // full shape back — prepareMutationEntry discards it into a plain string on write.
    const metadata = buildEntryMetadata({
      allowAsPatternVariable: true,
      semanticType: 'location',
      allowedVariableTypes: { X: ['character'] },
    });
    expect(metadata).toEqual({
      allowAsPatternVariable: true,
      semanticType: 'location',
      allowedVariableTypes: { X: ['character'] },
    });
  });
});

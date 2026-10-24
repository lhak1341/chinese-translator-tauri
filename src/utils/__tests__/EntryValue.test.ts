/**
 * Tests for EntryValue — reading an entry's fields, building its metadata, and the pure
 * pieces of patching one field. buildEntryMetadata is the single metadata-shape builder
 * (architecture review 2026-08-28, candidate #3 grilling). No dictionary-type gate — planAdd/planUpdate (DictionaryEdit.ts) is the
 * sole real authority on whether metadata is kept, discarding it for non-complex dicts
 * regardless of shape.
 */

import { describe, test, expect } from 'vitest';
import {
  buildEntryMetadata,
  entryFields,
  applyEntryPatch,
  toggleVariableType,
} from '../dictionary/EntryValue';

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
    // full shape back — planAdd/planUpdate discard it into a plain string on write.
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

describe('entryFields', () => {
  test('reads a string value as a translation with empty metadata', () => {
    expect(entryFields('good')).toEqual({
      translation: 'good',
      allowAsPatternVariable: false,
      semanticType: '',
      allowedVariableTypes: {},
    });
  });

  test('reads every field of an object value, absent ones as empty', () => {
    expect(entryFields({ translation: 'Nam Kinh', semanticType: 'location' })).toEqual({
      translation: 'Nam Kinh',
      allowAsPatternVariable: false,
      semanticType: 'location',
      allowedVariableTypes: {},
    });
    expect(
      entryFields({
        translation: 'X của Y',
        allowAsPatternVariable: true,
        allowedVariableTypes: { X: ['character'] },
      })
    ).toMatchObject({ allowAsPatternVariable: true, allowedVariableTypes: { X: ['character'] } });
  });
});

describe('applyEntryPatch', () => {
  test('changes only the patched fields', () => {
    const fields = entryFields({
      translation: 'a',
      semanticType: 'location',
      allowAsPatternVariable: true,
    });
    expect(applyEntryPatch(fields, { semanticType: 'character' })).toEqual({
      ...fields,
      semanticType: 'character',
    });
  });

  test('an emptied field drops out of the metadata built from the result', () => {
    const fields = entryFields({
      translation: 'a',
      semanticType: 'location',
      allowedVariableTypes: { X: ['character'] },
    });
    const patched = applyEntryPatch(fields, { semanticType: '', allowedVariableTypes: {} });
    expect(buildEntryMetadata(patched)).toEqual({ allowAsPatternVariable: false });
  });
});

describe('toggleVariableType', () => {
  test('adds a type a variable did not allow', () => {
    expect(toggleVariableType({ X: ['character'] }, 'X', 'location')).toEqual({
      X: ['character', 'location'],
    });
    expect(toggleVariableType({}, 'Y', 'location')).toEqual({ Y: ['location'] });
  });

  test('removes a type it did, and the key with its last type', () => {
    expect(toggleVariableType({ X: ['character', 'location'] }, 'X', 'character')).toEqual({
      X: ['location'],
    });
    expect(toggleVariableType({ X: ['character'], Y: ['location'] }, 'X', 'character')).toEqual({
      Y: ['location'],
    });
  });

  test('never mutates what it was given', () => {
    const current = { X: ['character'] };
    toggleVariableType(current, 'X', 'character');
    expect(current).toEqual({ X: ['character'] });
  });
});

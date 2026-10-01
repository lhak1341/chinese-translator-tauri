/**
 * TS half of the dictionary-id and config-key parity check with the Rust commands
 * (src-tauri/src/dictionary_commands.rs, ADR-060). Both read
 * src/test/fixtures/dictionary_id_rules.json, so a rule changed on one side fails the other.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import fixture from '../../test/fixtures/dictionary_id_rules.json';
import {
  kindOf,
  tierOf,
  hasPairedPatterns,
  toPatternsId,
} from '../dictionary/DictionaryIdClassifier';
import { saveAppConfig } from '../appConfig';
import { installFakeConfigDisk } from '../../test/fakeConfigDisk';

vi.mock('../logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('dictionary id rules (shared with Rust)', () => {
  test.each(fixture.ids)('$id', ({ id, kind, tier, hasPairedPatterns: paired, patternsId }) => {
    expect(kindOf(id)).toBe(kind);
    expect(tierOf(id)).toBe(tier);
    expect(hasPairedPatterns(id)).toBe(paired);
    if (patternsId) expect(toPatternsId(id)).toBe(patternsId);
  });
});

describe('config keys (shared with Rust)', () => {
  beforeEach(() => {
    (window as unknown as { electronAPI: unknown }).electronAPI = {};
  });

  test('every key appConfig.ts writes is classified in the fixture, and no other', async () => {
    const { disk } = installFakeConfigDisk();

    await saveAppConfig({ reader: { lastBook: 'a-book' } });

    expect(Object.keys(disk.raw).sort()).toEqual(Object.keys(fixture.configKeys).sort());
  });
});

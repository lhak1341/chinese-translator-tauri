/**
 * JS half of the WASM/JS dictionary-lookup parity check. Feeds the fixture shared with
 * wasm-core/tests/trie_lookup_parity_test.rs through DictionaryManager's cache-free JS
 * lookup, so both sides prove the same `expected` (ADR-058).
 */
import { describe, test, expect } from 'vitest';
import fixture from '../../../wasm-core/tests/fixtures/trie_lookup_parity.json';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';

describe('dictionary lookup parity fixture (JS side)', () => {
  test.each(fixture.cases)('$name: $word', async ({ word, expected }) => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: fixture.entries });

    const result = manager._findInDictionaries(word, ['chars']);

    expect(result?.translation ?? null).toBe(expected);
  });
});

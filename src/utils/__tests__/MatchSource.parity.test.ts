/**
 * src/test/fixtures/lookup_index_parity.json is the contract for what "dictionary matches
 * starting at a text position" means. The Rust lookup index is checked against it by
 * `test_lookup_index_matches_the_shared_parity_fixture` in src-tauri/src/dictionary_commands.rs;
 * this file checks the JS trie against it, and the order MatchSource puts a Rust-shaped match
 * list in. ADR-082.
 */
import { describe, it, expect, vi } from 'vitest';
import fixture from '../../test/fixtures/lookup_index_parity.json';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';
import { TranslationEngine } from '../TranslationEngine.js';
import { openMatchSource } from '../dictionary/MatchSource';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Dictionary = { priority: number; entries: Record<string, string> };
type Lookup = {
  position: number;
  charPosition: number;
  category: 'properNouns' | 'phrases' | 'characters';
  dictionarySet: string[];
  expected: { word: string; dictionary: string }[];
};

const dictionaries = fixture.dictionaries as Record<string, Dictionary>;

async function loadManager() {
  const manager = new DictionaryManager();
  await manager.loadDictionaries(
    Object.fromEntries(Object.entries(dictionaries).map(([name, d]) => [name, d.entries])),
    {
      priorities: Object.fromEntries(
        Object.entries(dictionaries).map(([name, d]) => [name, d.priority])
      ),
    }
  );
  return manager;
}

const pick = (matches: { word: string; dictionary?: string }[]) =>
  matches.map(({ word, dictionary }) => ({ word, dictionary }));

// A token at the lookup's position; the match source reads only its `start` (the index) or the
// tokens that follow it (the trie).
function tokensFor(text: string) {
  let start = 0;
  return [...text].map((value) => {
    const token = { type: 'chinese_char', value, start, end: start + value.length };
    start += value.length;
    return token;
  });
}
const tokenIndexAt = (text: string, position: number) =>
  tokensFor(text).findIndex((token) => token.start === position);

describe('lookup index parity fixture', () => {
  it('uses the priorities the TS rule would assign', async () => {
    const manager = await loadManager();
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      expect(manager.getPriorityForDictionary(name), name).toBe(dictionary.priority);
    }
  });

  for (const testCase of fixture.cases) {
    describe(testCase.name, () => {
      for (const lookup of testCase.lookups as Lookup[]) {
        const label = `${lookup.category} at ${lookup.position} over [${lookup.dictionarySet}]`;

        it(`JS trie: ${label}`, async () => {
          const manager = await loadManager();
          const matches = manager.findAllMatches(testCase.text, lookup.position, [
            ...lookup.dictionarySet,
          ]);
          expect(pick(matches)).toEqual(lookup.expected);
        });

        it(`MatchSource over the JS trie: ${label}`, async () => {
          const manager = await loadManager();
          const source = await openMatchSource(testCase.text, {
            dictionaryManager: manager,
            logWarn: () => {},
          } as never);
          const tokens = tokensFor(testCase.text);
          const at = tokenIndexAt(testCase.text, lookup.position);
          const matches = source.forPhase([...lookup.dictionarySet])(
            tokens as never,
            at,
            lookup.category
          );
          // The trie reads the text that follows the token, so it is checked from the token on.
          expect(pick(matches)).toEqual(lookup.expected);
        });

        // An astral text never reaches the index (MatchSource.test.ts), so only the others
        // can be read back from a Rust-shaped list.
        if (![...testCase.text].some((char) => char.length > 1)) {
          it(`MatchSource over a Rust-shaped index, winner first: ${label}`, async () => {
            // Rust lists a position's matches in dictionary order; build one that way
            // (reversed, so the order the sort has to restore is not already the right one).
            const rustOrder = [...lookup.expected].reverse().map((match) => ({
              ...match,
              priority: dictionaries[match.dictionary].priority,
            }));
            global.window.electronAPI = {
              buildLookupIndex: vi.fn().mockResolvedValue({
                success: true,
                index: { [lookup.charPosition]: { [lookup.category]: rustOrder } },
              }),
            } as never;
            const manager = await loadManager();
            // The fixture's texts are short; the index path starts at 50 characters.
            const source = await openMatchSource(testCase.text + '。'.repeat(60), {
              dictionaryManager: manager,
              logWarn: () => {},
            } as never);

            const matches = source.forPhase([...lookup.dictionarySet])(
              tokensFor(testCase.text) as never,
              tokenIndexAt(testCase.text, lookup.position),
              lookup.category
            );
            expect(pick(matches)).toEqual(lookup.expected);
          });
        }

        // The character-only pass used to take `findLongestMatchAtPosition` when no index
        // was built; it now takes the first match of the character lookup. They must agree.
        if (lookup.category === 'characters') {
          it(`first character match equals findLongestMatchAtPosition: ${label}`, async () => {
            const manager = await loadManager();
            const tokens = tokensFor(testCase.text);
            const at = tokenIndexAt(testCase.text, lookup.position);
            const longest = TranslationEngine.prototype.findLongestMatchAtPosition.call(
              {},
              tokens,
              at,
              manager.getDictionary('characters'),
              'characters'
            );
            const first = manager.findAllMatches(testCase.text, lookup.position, ['characters'])[0];
            expect(longest?.word).toBe(first?.word);
            expect(longest?.translation).toBe(first?.translation);
          });
        }
      }
    });
  }
});

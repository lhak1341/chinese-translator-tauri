/**
 * Flattens a raw dictionary JSON object directly into the shape the Rust lookup-index
 * builder expects: `{chinese, vietnamese, metadata}[]`.
 *
 * Exists so DictionaryManager can hand LookupIndexBuilder entries computed once at
 * dictionary-load time, instead of the index build walking the already-built
 * DictionaryTrie back into a flat array via DFS on every translate call. Reads the same
 * raw JSON that trie construction reads — never touches a DictionaryTrie — so there is
 * no cycle/depth risk to guard against; the guard existed only because the old approach
 * walked a live trie as if it were untrusted structure to reverse-engineer.
 *
 * Per-entry metadata intentionally does NOT include the derived `priority`/`frequency`/
 * `dictionary` fields that DictionaryManager's own trie-insert loop computes — grepping
 * every reader of trie-node metadata found none that read those fields; Rust treats
 * `metadata` as an opaque passthrough string. Only carries whatever the source JSON
 * itself provided (e.g. `allowAsPatternVariable`, `semanticType`, `allowedVariableTypes`).
 */

export interface FlatDictionaryEntry {
  chinese: string;
  vietnamese: string;
  metadata: string | null;
}

type DictionaryValue = string | { translation: string; [key: string]: unknown };

export function flattenDictionaryEntries(
  dictionaryData: Record<string, DictionaryValue>
): FlatDictionaryEntry[] {
  const entries: FlatDictionaryEntry[] = [];

  for (const [source, target] of Object.entries(dictionaryData)) {
    if (typeof target === 'string') {
      entries.push({ chinese: source, vietnamese: target, metadata: null });
    } else if (target && typeof target === 'object' && typeof target.translation === 'string') {
      const { translation: _translation, ...rest } = target;
      const hasMetadata = Object.keys(rest).length > 0;
      entries.push({
        chinese: source,
        vietnamese: target.translation,
        metadata: hasMetadata ? JSON.stringify(rest) : null,
      });
    }
  }

  return entries;
}

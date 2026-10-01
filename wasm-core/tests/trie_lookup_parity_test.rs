//! Rust half of the WASM/JS dictionary-lookup parity check.
//!
//! `DictionaryManager.translate(word)` answers from `DictionaryWasmLookup.translate` when
//! WASM is ready, and from `DictionaryTrie.getWithMetadata` otherwise (ADR-007: both are
//! real production adapters). The WASM path takes `findMatches(dict, word, 0)[0]`, which is
//! `TrieNode::find_matches` here. This file feeds that `pub fn` the shared fixture; the JS
//! half, `src/utils/__tests__/DictionaryLookup.parity.test.js`, feeds the same fixture to
//! the JS trie. Parity means both sides prove the same `expected`.
//!
//! This replaces the runtime `validateWasmFallback` check, which never ran (ADR-058).

use serde::Deserialize;
use translation_wasm_core::trie::TrieNode;

#[derive(Deserialize)]
struct Case {
    name: String,
    word: String,
    expected: Option<String>,
    #[serde(rename = "wasmExpected")]
    wasm_expected: Option<String>,
}

#[derive(Deserialize)]
struct Fixture {
    entries: std::collections::BTreeMap<String, String>,
    cases: Vec<Case>,
}

fn lookup(trie: &TrieNode, word: &str) -> Option<String> {
    trie.find_matches(word, 0).first().map(|m| m.translation.clone())
}

#[test]
fn trie_lookup_matches_the_shared_fixture() {
    let fixture: Fixture =
        serde_json::from_str(include_str!("fixtures/trie_lookup_parity.json")).unwrap();
    let mut trie = TrieNode::new();
    for (word, translation) in &fixture.entries {
        trie.insert(word, translation.clone(), None);
    }

    let failures: Vec<String> = fixture
        .cases
        .iter()
        .filter_map(|case| {
            let actual = lookup(&trie, &case.word);
            // wasmExpected: the raw trie answers prefix matches by design; DictionaryWasmLookup
            // narrows them to an exact hit (DictionaryWasmLookup.test.js).
            let want = case.wasm_expected.clone().or_else(|| case.expected.clone());
            (actual != want).then(|| {
                format!("{}: word {:?} expected {:?}, got {:?}", case.name, case.word, want, actual)
            })
        })
        .collect();

    assert!(failures.is_empty(), "trie lookup diverges from the fixture:\n{}", failures.join("\n"));
}

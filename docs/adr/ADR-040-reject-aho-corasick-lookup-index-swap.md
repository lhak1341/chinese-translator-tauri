# ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie

**Status:** Decided
**Date:** 2026-08-20

## Context

A user question ("is there a dependency more optimized than what we're using, for translation speed?") led to a multi-step investigation of dictionary-lookup matching performance.

**First wrong turn:** benchmarked `wasm-core/src/trie.rs`'s hand-rolled `HashMap<char, TrieNode>` trie in isolation, found its `#[wasm_bindgen]`-exported non-slice `find_matches`/`find_longest_match` methods re-collect `text.chars()` on every call (~140-220x slower than the slice-based variant). This looked like a major finding until the real JS call path was traced end-to-end (`DictionaryWasmLookup.js` → `LookupIndexBuilder.ts` → `RustLookupIndexManager.js` → `tauriAPI.ts` → `src-tauri`): for any text ≥50 chars (`MIN_TEXT_FOR_RUST_INDEX` in `TranslationConstants.js` — essentially all real translations), the app builds a lookup index **once** via a single Tauri IPC call into a **separate, native Rust trie** (`src-tauri/src/lookup_index_engine.rs::TrieNode`, distinct from the `wasm-core` one), already parallelized across positions via `rayon`. The `wasm-core` trie's expensive path only fires on trivial (<50 char) snippets or a double-fallback error path. The initial finding didn't matter for real translation speed.

**Second step:** benchmarked the _actual_ hot-path trie (`lookup_index_engine::TrieNode`) against aho-corasick raw match-finding, single dictionary, single-threaded: aho-corasick won by 2.6-3.7x across dictionary sizes (1k/5k/15k entries), narrowing as size grew. This looked like a real, actionable signal.

**Third step — prototyping the swap:** built `AhoIndex` (one combined aho-corasick automaton across all 7 loaded dictionaries, replacing the per-dictionary-per-position trie walk with one single overlapping pass over the whole text), with a parity test proving byte-for-byte equivalent output to the trie path on overlapping, multi-dictionary, multi-priority input. First full-pipeline benchmark (production-scale: 7 dictionaries, ~26,500 entries, 8,000-char corpus) showed aho-corasick **~40x slower** than production — alarming, but turned out to be a benchmark bug: the automaton was being rebuilt from scratch inside the timed loop on every call, conflating one-time construction cost (~33ms for ~27k entries) with per-translation matching cost. Production builds its trie once at dictionary-load time and reuses it for every translation; the prototype needed the same shape.

**Fourth step — corrected comparison:** separated `AhoIndex::build` (construction, meant to run once per dictionary load/reload) from `AhoIndex::find_all` (matching, the real per-translation hot path), and re-benchmarked with construction happening once, outside the timed loop — mirroring how `Dictionary { trie: Arc<TrieNode> }` is already built once and reused. Corrected result:

| approach                                                                                     | time (production-scale, 8-core machine) |
| -------------------------------------------------------------------------------------------- | --------------------------------------- |
| `build_comprehensive_lookup_index` (actual production — trie, rayon-parallel across 8 cores) | 781 µs                                  |
| `AhoIndex::find_all` (single-threaded, automaton pre-built)                                  | 1.04 ms — **~1.33x slower**             |
| `AhoIndex::build` (one-time automaton construction)                                          | 33.3 ms                                 |

Aho-corasick's real single-threaded per-step algorithmic advantage (confirmed, 2.6-3.7x) does not survive contact with the fact that production already gets an ~8-way parallelism win from `rayon` on this hardware — the trie's simpler per-step cost, spread across 8 cores, beats aho-corasick's cheaper-per-step but single-threaded pass.

## Decision

Do not swap `lookup_index_engine`'s trie-based lookup index for aho-corasick. The prototype (`AhoIndex` struct, `TrieNode::collect_entries()` helper, 3 parity/unit tests) was built, verified correct, benchmarked, and then fully removed from the codebase per the user's request — nothing from this investigation is wired into any live path.

What remains: `src-tauri/benches/trie_matching.rs` and `wasm-core/benches/trie_matching.rs`, comparing the raw trie-walk vs. aho-corasick-single-pass cost (the isolated, non-full-pipeline number) at several dictionary sizes, for future reference.

## Reasoning

**Single-threaded algorithmic wins don't automatically transfer to a system that's already parallel.** The natural instinct — "a faster algorithm must be a win" — ignores that the current implementation isn't naive; it already exploits the machine's cores via `rayon`. Any proposed replacement has to be compared against the _actual_ competitor (parallel trie), not a strawman (single-threaded trie).

**Benchmark methodology bugs produce results that look decisive in either direction.** The first full-pipeline number (~40x slower) was wrong, not just noisy — and it was wrong in a way that would have been very easy to report as "aho-corasick is a disaster, don't bother," which would have been just as incorrect as blindly trusting a too-good result. The fix (isolate one-time construction from per-call matching, mirroring the real system's load-once/use-many lifecycle) is the generalizable lesson: any benchmark of a "build once, use many times" structure must construct it outside `b.iter()`.

**Making aho-corasick competitive would require chunked-parallel scanning** (split text across `rayon` threads, each scanning a chunk, with overlap-handling for matches spanning a chunk boundary) — real added complexity and correctness risk, for a payoff that isn't proven positive even in principle (chunking overhead + boundary bookkeeping vs. an already-fast 781µs baseline). Not worth pursuing without a concrete performance complaint motivating it.

## Consequence

Future performance work on dictionary lookup should start from `lookup_index_engine::TrieNode` (native, rayon-parallel) as the known hot path for real translations, not `wasm-core::trie` (see the corresponding notes added to both crates' `CLAUDE.md`). If aho-corasick (or any other matching algorithm) is reconsidered later, benchmark it against the _parallel_ trie baseline from the start, and construct any "build once" structure outside the timed loop from the first benchmark, not after a misleading result forces a correction.

## Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false

The Fourth-step comparison above states the trie side "is already built once and reused," mirroring `Dictionary { trie: Arc<TrieNode> }`. That's true of this ADR's own benchmark harness — it isn't true of the shipped `build_lookup_index` command. `build_lookup_index_impl` rebuilt a fresh `TrieNode` from the JS-sent entries on every single IPC call (no persistence across calls, no cache, `lib.rs` managed no such state) — i.e. every translation, not once per dictionary load.

Measured in isolation (scratch bench, not committed): building ~26,500 entries across 7 dictionaries costs ~7–10ms warm, against the 781µs matching cost this ADR's own table cites — construction dominated the real per-call cost by roughly an order of magnitude. This doesn't change the ADR's Aho-Corasick conclusion (that comparison used correctly-isolated one-time construction on both sides), but the "actual production" framing of the 781µs figure was inaccurate about what production actually paid per call.

Fixed by adding `TrieCache` (`dictionary_commands.rs`, content-hash-keyed per dictionary's own entries — not by dictionary_id, so there is no invalidation path to wire or forget) alongside `DictionaryCache`. `build_lookup_index_impl` now checks the cache before calling `build_trie_from_entries`, only paying construction cost when a dictionary's content hash hasn't been seen before.

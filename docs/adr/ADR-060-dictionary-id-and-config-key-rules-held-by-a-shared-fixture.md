# ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #4) found the same facts written in both languages with nothing asserting they agree:

- **Tier and pairing rules.** `has_paired_patterns` in `src-tauri/src/dictionary_commands.rs` says it "mirrors the frontend's `hasPairedPatterns`" (`DictionaryIdClassifier.ts`). The `patterns-` ⇄ `properNouns-` derivation was written inline in Rust at three sites; TS has `toPatternsId`.
- **Config keys.** `appConfig.ts` (`fromRaw`/`toRaw`) maps six flat keys into `engine/ui/session/reader`. Rust spells three of them as string literals in `substitute_dictionary_reference`.
- **A hole in the rename cascade.** A new config key that holds a dictionary id keeps pointing at the old name after a rename, unless someone remembers to add it to the Rust substitution. Nothing forced that question.

Run by hand, the two sides agreed on every well-formed id. The risk was drift, not a live bug.

## Decision

One fixture, `src/test/fixtures/dictionary_id_rules.json`, read by both suites (the ADR-033 / ADR-041 shape):

- an `ids` table: kind, tier, `hasPairedPatterns` and `patternsId` per id. `DictionaryIdRules.parity.test.ts` holds `DictionaryIdClassifier` to it. The Rust `tests` module holds `has_paired_patterns` and `to_patterns_id` to it.
- a `configKeys` table classifying every key `toRaw` writes as `dictionaryReference` (string or array shape) or `other`. The TS test fails when `toRaw`'s keys and the table differ, so adding a key forces the decision. The Rust test fails unless `substitute_dictionary_reference` rewrites exactly the `dictionaryReference` keys and leaves `other` ones alone.

Rust gains `to_patterns_id`, replacing the three inline copies, so the derivation has an interface to test through.

## Reasoning

**Rust keeps editing `config.json` during a rename.** Moving those edits to a TS-driven transform was rejected. The cascade runs in Rust atomically with the file moves, and `substitute_dictionary_reference` is called again with `(new, old)` to roll back. Splitting the config edit from the file moves would leave the rename's atomicity across two runtimes, a worse seam than today's. `callRustConfigWrite` already serializes the Rust write on the config lock.

**`DictionaryType::from_name` and `kindOf` stay different.** `from_name` defaults unknown ids to Phrases and every JS phase filters by its own dictionary set; the difference is documented at both sites and answers a different question.

## Consequence

A new dictionary-id rule or config key is added to the fixture first, so both suites see it. A future review should not re-propose moving Rust's config edits to TS, or merging `from_name` with `kindOf`. Revisit if a rename needs a config key Rust cannot reach, or if the cascade stops being one atomic Rust operation.

**Addendum 2026-10-03 (architecture review candidate #2):** the decision stands for rename, and is narrowed for create. Create's `activeProperNouns` append was never atomic with anything: it was best-effort and silent when `config.json` was missing or unreadable, its only reverse (`deactivate_proper_noun_file`) was a second best-effort write, and the list it read back had no production reader. It moved to TS: `BookBindingStore.createDictionary` activates under the config lock, with the open book's binding owning the fiction slice, and reports a `warning` when it cannot. Rust's create commands write no config. A future review should not restore the Rust append, and should not re-propose moving rename's edit (above).

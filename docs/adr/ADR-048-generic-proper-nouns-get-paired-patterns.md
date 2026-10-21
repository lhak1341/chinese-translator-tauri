# ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too

**Status:** Decided
**Date:** 2026-09-26
**Extends:** ADR-027

## Context

ADR-027 paired every fiction proper-nouns dictionary (`properNouns-f_X`) with a structural patterns dictionary (`patterns-f_X`), coupled by naming convention and activated by the same `activeProperNouns` toggle. Generic (theme) dictionaries (`properNouns-_X`, e.g. `_NhatBan`, `_LichSuTQ`) had no such pair, so a pattern specific to a theme — a Japanese honorific, a Chinese-history title form — could only go into the global `patterns` dictionary, where it applied to every text.

## Decision

Generic proper-nouns dictionaries are paired the same way: `properNouns-_X` ↔ `patterns-_X`. The pair is created atomically (the existing `create_fiction_dictionary_pair` command, which now accepts both tiers), renamed together (the `rename_proper_nouns_dictionary` cascade), and backfilled at startup for pre-existing dictionaries by the same migration fiction uses. Custom (`properNouns-Foo`) and root dictionaries stay unpaired.

- **Engine merge precedence:** base `patterns` < generic < fiction. `filterDictionariesForEngine` spreads all active generic pattern dicts first, then all active fiction ones, regardless of `activeProperNouns` order.
- **Cmd-6 mirrors Cmd-5.** An active default names its own patterns half (root `properNouns` → root `patterns`). A default with no pair (custom), or no usable default, falls to the first active paired dictionary by tier (fiction, then generic; alphabetical within a tier), then to root `patterns`. There is no longer a "no fiction" miss; the only miss is a pair whose patterns file is absent from memory.

## Reason

**Same mechanism, no new concept.** Every reason ADR-027 gave for the naming convention (one toggle, no config drift, optional by presence) applies unchanged to a theme dictionary. The predicate that gates pairing widened from "fiction tier" to "fiction or generic tier" (`hasPairedPatterns` / `isPairedPatternsId` in `DictionaryIdClassifier.ts`, `has_paired_patterns` in `dictionary_commands.rs`); nothing else about the coupling changed.

**Fiction over generic** because a novel's own conventions are more specific than a theme's, the same reason fiction proper nouns get the highest trie priority.

**Cmd-6 with a root fallback** keeps the two quick-add keys symmetric: the user reads both off the same default and active list, and neither refuses to open.

## Consequences

- The Rust command is still named `create_fiction_dictionary_pair`; it now creates generic pairs too. A generic pair is created from the Configuration tab directly, not through `BookBindingContext`, since no book binds to a generic dictionary.
- Book binding stays fiction-only (`isFictionProperNounsId`): `BookRecordValidation`, `BindingActivation`, `ReaderQuickAddTarget`.
- An unbound book's Cmd-6 in the Reader now opens the active generic pair (or root `patterns`) instead of prompting to bind a fiction dictionary.
- Renaming a paired dictionary into the custom tier (`properNouns-_X` → `properNouns-Foo`) still cascades the patterns file to `patterns-Foo`, which then has no pair and no effect. This was already true of fiction dictionaries and is left as is.

## Addendum (2026-10-21)

An architecture review (candidate #5) proposed one create command that pairs whenever `has_paired_patterns`, deleting the TypeScript branch in `createDictionary` (`DictionaryPairs.ts`) that picks between `create_fiction_dictionary_pair` and `create_proper_nouns_dictionary`. Declined:

- TypeScript asks `hasPairedPatterns` anyway, to know which halves to load into the Dictionary Store after a create (`halvesOf`), as rename does for which halves to swap. Removing the branch would concentrate nothing.
- The two copies of the rule cannot drift: `hasPairedPatterns`/`toPatternsId` and `has_paired_patterns`/`to_patterns_id` are held to `src/test/fixtures/dictionary_id_rules.json` (ADR-060). Rust's `has_paired_patterns` check in the pair command is a guard against a wrong id, not a second decision.
- The command keeps its misleading name. Renaming it touches the Rust command, `lib.rs`, `tauriAPI.ts` and the IPC mocks in five test files for no change in behaviour.

Revisit if a create command returns the ids it created, so TypeScript no longer needs the rule to load them.

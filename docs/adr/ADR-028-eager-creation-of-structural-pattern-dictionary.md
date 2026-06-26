# ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation

**Status:** Decided  
**Date:** 2026-06-26

## Context

When a user creates a new fiction in ConfigurationManager ("New" button), the app currently creates one file: `properNouns-f_X.json`. With structural pattern dictionaries introduced, each fiction can have a paired `patterns-f_X.json`.

Two creation strategies were considered:

1. **Eager** — "New" creates both `properNouns-f_X.json` and `patterns-f_X.json` together. Always paired.
2. **Lazy** — "New" creates only `properNouns-f_X.json`. A per-fiction "Add Structural Pattern" button in ConfigurationManager creates `patterns-f_X.json` on explicit opt-in.

Existing fictions (created before this feature) have no `patterns-f_X.json`. A migration is needed regardless of strategy.

## Decision

Eager creation. "New" calls `create_proper_nouns_dictionary` and `create_pattern_dictionary` together, producing both files atomically. ConfigurationManager mount runs a one-time migration that creates missing `patterns-f_*` files for all existing `properNouns-f_*` dicts.

## Reason

**Conceptual simplicity.** The coupling invariant (every fiction has both files) is easier to reason about than a partial state (some fictions have a pattern file, some don't). The UI, engine init, and hotkey derivation can all assume the file exists without an existence check.

**Empty files are free.** An empty `patterns-f_X.json` (`{}`) is 2 bytes. Loading an empty trie is microseconds. The engine merge of an empty dict is a no-op. The runtime cost of eager creation is negligible.

**Lazy creation's benefit is marginal.** The main argument for lazy was avoiding empty files. Since the runtime cost is negligible, lazy's only advantage is that file presence is meaningful (non-empty = actively used). This signal is not used by any current code path.

**Considered and rejected:** lazy was rejected because it introduces an existence-check code path in the engine, ConfigurationManager, and hotkey handler — all of which must gracefully handle the "no pattern file" case. Eager eliminates this class of conditional entirely.

## Consequences

- `create_proper_nouns_dictionary` Rust command must be accompanied by a `create_pattern_dictionary` call from the JS side (two Tauri commands, not one). If `create_pattern_dictionary` fails after `create_proper_nouns_dictionary` succeeds, the fiction exists without a pattern file — a partial state. The JS caller should log and continue; the migration at mount will repair it on next launch.
- Rename must cascade: `rename_proper_nouns_dictionary` in the UI triggers both `rename_proper_nouns_dictionary` and `rename_pattern_dictionary`. Partial rename (one succeeds, one fails) breaks the naming convention coupling from ADR-027. Rust commands should be called sequentially; on second failure, surface an error and instruct the user to rename manually.
- ConfigurationManager mount migration: calls `list_proper_nouns_dictionaries`, derives expected `patterns-f_*` names, calls `list_pattern_dictionaries`, creates any missing files via `create_pattern_dictionary`. Idempotent — safe to run on every mount.

# ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init

**Status:** Decided  
**Date:** 2026-06-26

## Context

Fiction-specific proper noun dictionaries follow the convention `properNouns-f_X` (e.g. `properNouns-f_DuongThan`). When a fiction requires structural Phase 1 patterns that don't belong in the global `patterns` dictionary, those entries live in a paired `patterns-f_X` file.

Two approaches were considered for coupling the two dictionaries:

1. **Explicit config field** — a new `activeStructuralPatterns: string[]` in `EngineConfig`, maintained in parallel with `activeProperNouns`. The engine loads both arrays independently.
2. **Naming convention at engine init** — the engine derives the patterns dict name by prefix-swapping: for each `properNouns-f_X` in `activeProperNouns`, check if `patterns-f_X` is present in the loaded `dictionaries` object and, if so, merge it into the pattern processor before `initializePatterns` runs. No new config field.

## Decision

Couple by naming convention at engine init (option 2). The engine merges `patterns-f_X` entries before `initializePatterns` is called, with fiction entries inserted first so they win on same-template conflicts with the global `patterns` dictionary.

## Reason

**One toggle, zero config drift.** The primary design goal was that toggling a fiction on/off (changing `activeProperNouns`) automatically activates/deactivates its structural patterns with no second action. An explicit `activeStructuralPatterns` array would require keeping it in sync with `activeProperNouns` — a new class of misconfiguration where the two arrays diverge.

**Naming convention is already the idiom.** `properNouns-f_X` is already identified by prefix scan in `isDictionaryCategory`, `list_proper_nouns_dictionaries`, and `ConfigurationManager`. Extending the same convention to `patterns-f_X` is consistent.

**Optional by presence.** If `patterns-f_X` is absent from `dictionaries`, the merge is a no-op. Fictions without structural patterns need no empty config entry — absence of the file is the signal.

**Considered and rejected:** explicit config was rejected because it adds a sync invariant between two arrays with no enforcement mechanism. The naming convention makes the coupling self-evident from the file names alone.

## Consequences

- Engine init must scan `activeProperNouns`, derive `patterns-f_X` names, and check `dictionaries` for each. This is a new step in the init path.
- Renaming a fiction (`properNouns-f_X` → `properNouns-f_Y`) must also rename `patterns-f_X` → `patterns-f_Y` or the coupling silently breaks. The rename command must be atomic over both files.
- A `patterns-f_X` file present in `dictionaries` but whose fiction is not in `activeProperNouns` is silently ignored — this is intentional.
- `Ctrl/Cmd-6` (structural pattern bookmark hotkey) derives its target from `defaultQuickAddDictionary` via the same prefix swap, maintaining a single source of truth for the active fiction.

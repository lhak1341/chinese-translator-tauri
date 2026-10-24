# ADR-111: Candidate Finder Design

**Status:** Decided (design only; the build is a later effort)
**Date:** 2026-10-24

## Context

The Reader has no way to find proper nouns missing from a book's dictionaries; the reader notices them one at a time while reading. A wayfinder map (issue #35, "Candidate finder for new proper nouns") settled the design over seven tickets (#36-#42). This ADR keeps the choices a later reader would otherwise reverse or wonder about. The glossary terms are in `GLOSSARY.md`, "Candidate finder".

## Decision

**Signal.** Repeated strings of 2-8 characters, kept by cohesion (NPMI) and boundary evidence (accessor variety, no function-word edges, no glued edge), ranked by count. Raw frequency alone mostly finds fragments such as `他说道`. Candidates of 5-8 characters must be maximal repeats. A string seen frequently in more than 2 other books is dropped as common vocabulary (#38, #36).

**Library background table.** The "other books" gate needs a per-book sidecar of sorted 32-bit hashes of frequent strings, in a regenerable `book-index/` folder keyed by fingerprint, encoding and format version. It is built on open and backfilled on first run, and skipped below 4 other books. Books bound to the same fiction dictionary are not background (#42).

**Where it runs.** Tauri Rust, beside `BookCache`, in a pure module that also builds the sidecar. TS sends the dictionary keys; the finder never calls the JS trie. Targets: first run ≤15 s, re-run ≤3 s, ≤300 MB extra, all to be measured at build. Cancel is cooperative with staged progress events; a cancelled run leaves no partial sidecar, and a book or encoding change cancels and discards the run (#40).

**Mask follows Phase 2.** Spans matched by the book's active proper-noun dictionaries are masked before counting, using Phase 2's rule (leftmost, longer wins, a strictly longer match starting inside the span defers the earlier). Rust has its own matcher; one shared fixture is read by a JS test over `findMatchesAtToken` and a Rust test, so they cannot drift. Phase 1 pattern claims are ignored. An unread active dictionary refuses the run. Inactive proper-noun dictionaries only tag a candidate "also in X" (#41).

**Rules stay in TS.** Rust returns every survivor with its count. TS applies the Transform Rule boost (×3), the type pre-selection and the final cut through the same `findBestMatch` / `initialEntryGuess` the Add form uses, so a row never disagrees with what the Add form would seed (#41).

**No automatic writes.** The finder never writes a dictionary on its own. A row's Add goes through `planAdd` and the Dictionary Store commit; a batch is one `DictionaryEdit` (one undo). The finder suggests no translation beyond the Add form's existing guess, and no type beyond the rules (#39, #41).

**Dismissals** are `BookRecord.dismissedCandidates`, a reader's answer kept per book in `books.json` (#41).

**No result cache.** A run is not stored. A re-run takes ≤3 s because the sidecar holds the expensive part, and an add never re-runs on its own, so a cache would only add invalidation rules.

## Considered options

- **Frequency-only ranking.** Rejected: the top of the list is fragments (#36, #38).
- **A script outside the app.** Rejected as the form; allowed only as a prototype vehicle.
- **Rules and dictionary lookup in Rust.** Rejected: it would add a second implementation of rule matching and of Phase 2 matching to keep in step. Sending keys costs one IPC payload and one shared fixture.
- **Re-running after every add.** Rejected: runs are cheap, but rows jumping while the reader works through the list is worse than a "re-run to update" notice.

## Consequences

- **Known limits, accepted.** About 40% of findable hidden entries have too few distinct contexts for the neighbour gate and never reach the ranking; long transliterated names with no suffix are found only when cohesion and boundary evidence suffice. Measured on the held-out books: recall@1000 49% and 35%, precision@100 82% and 88% (#42). A looser second pass is a tuning question for after the build.
- **Variants of one entity** (`东哥`, `东子`) stay separate rows. Merging them is a later improvement.
- **The mask can disagree with the Translator** where a Phase 1 pattern claimed tokens a proper noun would have matched. Accepted: the effect is a few over- or under-masked strings.
- **Adding does not rebuild the engine** (ADR-106); the Reader's translated panels update at the next engine rebuild, as for every other Add.
- **Disk.** `books.json` gains one field, validated per element; `book-index/` is regenerable and safe to delete.
- **Not yet verified.** `planAddAll` and its outcome kind are inferred from `planDelete` and `planMove` taking lists, not probed against the history code.

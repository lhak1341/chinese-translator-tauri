# ADR-111: Candidate Finder Design

**Status:** Decided (built #44-#51; measured and tuned #52)
**Date:** 2026-10-24

## Context

The Reader has no way to find proper nouns missing from a book's dictionaries; the reader notices them one at a time while reading. A wayfinder map (issue #35, "Candidate finder for new proper nouns") settled the design over seven tickets (#36-#42). This ADR keeps the choices a later reader would otherwise reverse or wonder about. The glossary terms are in `GLOSSARY.md`, "Candidate finder".

## Decision

**Signal.** Repeated strings of 2-8 characters, kept by cohesion (NPMI) and boundary evidence (accessor variety, no function-word edges, no glued edge), ranked by count. Raw frequency alone mostly finds fragments such as `他说道`. Candidates of 5-8 characters must be maximal repeats. A string seen frequently in more than 2 other books is dropped as common vocabulary (#38, #36).

**Library background table.** The "other books" gate needs a per-book sidecar of sorted 32-bit hashes of frequent strings, in a regenerable `book-index/` folder keyed by fingerprint, encoding and format version. It is built on open and backfilled on first run, and skipped below 4 other books. Books bound to the same fiction dictionary are not background (#42).

**Where it runs.** Tauri Rust, beside `BookCache`, in a pure module that also builds the sidecar. TS sends the dictionary keys; the finder never calls the JS trie. Budget, as measured at #52 (Measured, below): re-run ≤3 s and ≤300 MB extra, first run ≤25 s and ≤350 MB extra. Cancel is cooperative with staged progress events; a cancelled run leaves no partial sidecar, and a book or encoding change cancels and discards the run (#40).

**Mask follows Phase 2.** Spans matched by the book's active proper-noun dictionaries are masked before counting, using Phase 2's rule (leftmost, longer wins, a strictly longer match starting inside the span defers the earlier). Rust has its own matcher; one shared fixture is read by a JS test over `findMatchesAtToken` and a Rust test, so they cannot drift. Phase 1 pattern claims are ignored. Instead TS drops a survivor an active pattern reads whole, `#` a numeral and X/Y/Z known variables (`三星卡片` under `#星X`; added 2026-10-25, applied when the run lands: Addendum 2026-10-26). An unread active dictionary refuses the run. Inactive proper-noun dictionaries only tag a candidate "also in X" (#41).

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

- **Known limits, accepted.** About 40% of findable hidden entries have too few distinct contexts for the neighbour gate and never reach the ranking; long transliterated names with no suffix are found only when cohesion and boundary evidence suffice. Measured on the held-out books by the prototype: recall@1000 49% and 35%, precision@100 82% and 88% (#42); the built finder reproduces that within noise (Measured, below). No looser second pass: the cutoff sweep found nothing that gains without losing reach.
- **Variants of one entity** (`东哥`, `东子`) stay separate rows. Merging them is a later improvement.
- **The mask can disagree with the Translator** where a Phase 1 pattern claimed tokens a proper noun would have matched. Accepted: the effect is a few over- or under-masked strings.
- **Adding does not rebuild the engine** (ADR-106); the Reader's translated panels update at the next engine rebuild, as for every other Add.
- **Disk.** `books.json` gains one field, validated per element; `book-index/` is regenerable and safe to delete.
- **`planAddAll`** is a plan like `planDelete` and `planMove` and its outcome kind is `addedAll { count, overwritten }` (`DictionaryEdit.ts`; probed at #52): all or nothing, one edit, one undo, a repeated dictionary and key written once.

## Measured (#52)

Real library (55 books, 47 other indexed books as background), real app dictionaries, release build, 4 performance and 4 efficiency cores, run while the machine was loaded (load average 8-14), so read times as ±10%. A throwaway Rust test over `analyse()` took the numbers; it is not kept. Dictionaries were read, never written; sidecars went to a scratch folder.

**Budget on 凡人修仙传** (the largest book, 15 MB, 144,874 lines, 52 MB resident once loaded):

|                               | Before tuning      | Built                                                                               | Budget                                                |
| ----------------------------- | ------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Re-run (sidecars present)     | 6.8-8.5 s, +263 MB | 2.6-2.8 s, +207-235 MB                                                              | ≤3 s, ≤300 MB: met                                    |
| First run (47 sidecars built) | 53 s, +357 MB      | 24 s, about +345 MB                                                                 | ≤15 s, ≤300 MB: **missed, relaxed to ≤25 s, ≤350 MB** |
| Sidecars on disk              |                    | 61 MB for 47 books                                                                  |                                                       |
| Jump, backend part            |                    | `read_book_lines` slice of 200 lines: 4-5 µs at line 1, 50%, 90% and the last lines |                                                       |

What changed to get there, none of it changing a result (the 18,012 candidates and all 47 sidecars were byte-identical before and after): n-gram counting is split into hash shards, one per worker (sidecar builds count in one pass); the scoring stage runs every filter that needs only a string and its count first, so one pass over the text looks up only those survivors (it was two passes over every frequent string, with the spread gate's 47 binary searches run before the cheap tests); a faster hasher for the n-gram tables; sidecars are built 3 books at a time. A miss was a choice between tightening and relaxing: the re-run was tightened to the budget; the first run builds one sidecar per book from scratch at about 1 s of CPU each, so it was relaxed. Cancel is polled once per counting level, not every chunk of runs: a level takes under half a second on 凡人修仙传. Four builds at once took 20-26 s but 440-780 MB, so 3 is the setting. In use a book's sidecar is built when it opens, so a first run that finds all 47 missing is the worst case.

Not measured: that memory is **freed** when a run ends (the process keeps 180-280 MB resident afterwards because the allocator holds its pages; live heap was not inspected), and how long the Vietnamese takes to fill in after a jump. Jump latency was measured in the running app (`tauri:dev` with a throwaway probe calling the same `scrollToLine` a candidate jump uses, 凡人修仙传 opened at its saved position): from line 1 the target row was in the translation panel after 78-138 ms (9 jumps to 50%, 90%, 95% and the last lines; median 106 ms, no trend with distance). The Vietnamese fill was not measured: in that session the windowed translation never started (rows stayed Chinese for minutes, with `isTranslating` false and nothing in the console; cause not found, and the window was in the background for part of it), so the inferred 0.1-0.3 s for the Vietnamese stands.

**Quality** (bound dictionary hidden, ranked by count; the rule boost is TS-side and not in this harness, so the reference's boost is the likely, unmeasured, reason for the shortfall on 阳神; findable = hidden entries of 2-8 characters seen at least 3 times, 856 on 九鼎记 and 1,528 on 阳神, 35 and 172 of them long):

|                          | 九鼎记 | 阳神  | ADR reference (九鼎记 / 阳神) |
| ------------------------ | ------ | ----- | ----------------------------- |
| recall@1000              | 49.4%  | 33.2% | 49% / 35%                     |
| long (5-8) recall@1000   | 48.6%  | 27.3% | 40% / 33%                     |
| precision@100            | 85%    | 88%   | 82% / 88%                     |
| ceiling (every survivor) | 60.2%  | 56.7% |                               |

With the other active proper-noun dictionaries masked as in a real run: recall@1000 47.7% and 32.1%, long 42.9% and 25.6%, precision@100 87% and 87%.

**Top false positives, read by hand** (top 100, 12-15 per book; what each is was judged by reading, not checked against the book): real names or groups the dictionary lacks (金蛛, 银鲨, 桃神, 百圣, 大乾皇, 赫连昊, 嬴氏家族, 傅家, 八大宗派); cultivation terms a reader may want (先天金丹, 洞虚, 灵肉合一, 粉碎真空); fragments glued to a neighbour (大千世界之中, 九州大地上, 滕青山和李珺, 达到虚境, 次雷劫高手, 渡过雷劫, 军军士); one plain verb (出壳). So roughly half the "false positives" are findings the held-out dictionary does not hold, and the glued fragments are the real noise.

**Cutoffs kept.** Swept one at a time on both books (recall@1000, 九鼎记 / 阳神): spread gate 1, 2, 3, 4, 6 books 48.6 / 49.4 / 49.9 / 49.2 / 48.4 and 32.8 / 33.2 / 32.6 / 32.4 / 32.1; NPMI 0.2-0.4 46.8-50.0 and 31.9-33.8; glued ratio 5-40 48.6-49.3 and 33.0-33.1; maximal-repeat dominance 0.3-0.9 47.7-50.1 and 32.4-33.9. Every cutoff moves recall@1000 by under 2 points around the built value, and long recall by whole entries (one entry is 2.9 points on 九鼎记). Dominance 0.5 was the only candidate (recall +0.1 and +0.7, precision@100 85% and 91%, long recall +5.7 and +2.4) and was refused: it removes names that are followed by one character half the time, so the ceiling falls 2.1 and 3.4 points, names the reader can then never reach for under a point at the top. The spread gate of 2 stays (the sidecar's "frequent in a book" now agrees with the prototype's pick).

## Addendum 2026-10-26: pattern coverage is applied when the run lands

The pattern coverage test (`CandidatePatternCoverage`) is built in `snapshotFinderDictionaries` from the same dictionaries the run sends to Rust, and `CandidateFinderStore` drops the covered survivors once, before it publishes the list. It ran inside `rankCandidates` until now, against the Dictionary Store as it is: every Add made a new dictionaries object, rebuilt the test and re-ranked every survivor (about 3 s over 18,000 survivors and the 4,082 root patterns, measured with Bun on synthetic strings, not in the app; the #52 budget above predates the pass). So a name added during a session never drops another row through pattern coverage until a re-run, like the Phase 2 mask.

The test now tries only the pattern keys whose first literal character the text holds (a key with no literal is tried for every text): about 35 ms for the same input, same result. `#` reads `NumberVariable`'s own `NUMERAL_CHARS` up to `MAX_NUMERAL_SPAN`, not a copy. Still not modelled, on purpose: allowed variable types, token-level matching, `PatternVariableCache`'s full-text stage, and more than one way to split two adjacent slots.

## Addendum 2026-11-08: panel views are by rank, and open on Top 250

Measured on 12 books (20k-175k lines) with the built finder, each scored against its own fiction dictionary (a lower bound: the dictionary lacks real names). The count at rank 250 ranges 25-167 and tracks length only loosely (r 0.64), so a count threshold cannot be one number; hit rate by rank is steady instead, pooled 68% (ranks 1-100), 47% (101-250), 31% (251-500), 18% (501-1000), the same shape in 11 of 12 books. The panel therefore offers rank chips (All ranks / Top 100 / 250 / 500), opens on Top 250 (about 55% hit rate, about 45% of the top-1000 hits), and applies the rule and length filters before the cut. By length within the top 250 the hit rate is 57% (2 chars), 65% (3), 50% (4), 24% (5+), and 5+ is only 3% of hits, so no length chip is on by default. Within an equal count the longer text now ranks first. Not measured: lineCount as the cut, and whether Top 250 hides entries a reader would have added.

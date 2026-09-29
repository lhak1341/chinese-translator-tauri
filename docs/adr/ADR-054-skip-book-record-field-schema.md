# ADR-054: Skip a Book Record Field Schema

**Status:** Decided
**Date:** 2026-09-30

## Context

The architecture review of 2026-09-29 (candidate #7) looked at what a new `BookRecord` field costs. `src/utils/reader/CLAUDE.md` listed four sites: the type in `src/types/ReaderTypes.ts`, its default in `emptyBookRecord` (`src/utils/reader/BookRecord.ts`), its repair in `validateBookRecord` (`src/utils/reader/BookRecordValidation.ts`), and, for a reader answer only, `READER_ANSWER_FIELDS`. The proposal was one schema module where each field declares its default, its repair and whether it is an answer or an observation, with the three functions derived from that table.

## Decision

Keep the three functions as they are. Do not build a field schema.

Close the one real gap instead: the chapter pattern ids that `validateBookRecord` checks against are declared once, as `CHAPTER_PATTERN_IDS` in `src/types/ReaderTypes.ts`, and `ChapterPatternId` is derived from it. `test-fixtures/chapter-pattern-ids.json` pins that list to Rust's `PatternId` (`src-tauri/src/chapter_outline.rs`) from both sides.

## Reasoning

**The compiler already enforces three of the four sites.** `emptyBookRecord` and `validateBookRecord` each return an object literal typed `BookRecord`, so a field missing from either fails `tsc`. `refreshBookRecord` builds its `answers` as a `Pick<BookRecord, ReaderAnswerField>` literal, so a word added to `READER_ANSWER_FIELDS` fails to compile until it is carried there too. The only step no tool checks is deciding whether a new field is an answer, and that is a judgment a schema table would ask for in the same way.

**The table fails the deletion test applied to itself** (see the ADR index's note on rejecting a split). Each field's repair is a different rule: `binding` falls back to "never answered" so the dialog re-offers, `position` to "not started", `chapterOutline` drops whole rather than per candidate. A table would hold the same functions under a different key, so the caller-facing shape would not change. The complexity would move, not concentrate.

**The drift that could happen was elsewhere.** `CHAPTER_PATTERN_IDS` was a hand-written array in the validation file, checked against nothing. A pattern added to the union and to Rust's enum would have been repaired away on every load: the manual override reset to election, and the saved outline to never-detected, silently.

## Consequence

A review that sees the "four sites" note and proposes a Book Record schema should find this ADR first. Reconsider if a field's repair rule ever has to be read by something other than `validateBookRecord` (a migration, an export), which would give the table a second consumer.

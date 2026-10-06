# ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads

**Status:** Decided
**Date:** 2026-10-07

## Context

An architecture review (2026-10-06, round 15, candidate #4) noted that the Reader's IPC payloads are written by hand on both sides. The Rust structs (`LibraryBook`, `LibraryScan`, `OpenBook`, `OpenBookResult`, `BookLines`, `BookFingerprint` in `src-tauri/src/book_commands.rs`; `EncodingReport` in `book_loader.rs`; `PatternCandidate`, `ChapterHeader`, `ChapterOutline` in `chapter_outline.rs`) carry `#[serde(rename_all = "camelCase")]`, and `src/types/ReaderTypes.ts` mirrors them. Only the chapter pattern ids are pinned (ADR-054, `test-fixtures/chapter-pattern-ids.json`). Renaming a Rust field (say `strictly_clean`) changes the wire key while the TypeScript interface still compiles, so `encoding.strictlyClean` reads `undefined`. The proposal was one fixture of serialized samples, checked by a Rust test and a TypeScript test. Round 14 had already declined to check response shapes, in a comment at the top of `src/__tests__/IpcCommands.parity.test.ts`; this ADR is where that decision is written down.

## Decision

Do not check the payload shapes. Leave the mirror hand-written.

## Reasoning

**The failure is loud and early.** `OpenBookResult` and `EncodingReport` are read on every book open, `BookLines` on every scroll. A drifted key breaks the first manual run of the Reader, in the same build that changed it. Nothing in these payloads outlives the build: a book record that reaches disk is repaired by `validateBookRecord`, which is why the pattern id list, the one thing that does persist, got its fixture.

**A TypeScript half costs a third copy.** The Rust half is cheap (round-trip a fixture through `from_value` and `to_value`). TypeScript interfaces do not exist at runtime and `tsc` excludes test files, so the other half needs a runtime key list per interface, such as `satisfies Record<keyof OpenBook, true>` in a non-test file. That is about 35 fields across 8 types declared a third time, and it fails the deletion test the way ADR-054's field schema did: the list would restate the interfaces under a different key, and the next field would still have to be added in three places.

**The only real fix is codegen.** `ts-rs` or `specta` would delete the hand-written interfaces. That adds a dependency and a generate-and-diff step to CI (`.github/workflows/ci.yml` does not launch the app), which is far larger than this candidate and has no other consumer.

**A Rust-only key-name test was considered and dropped.** It is a speed bump (the failing test tells the developer to update `ReaderTypes.ts`), not a check, and the developer renaming the field already greps for it.

## Consequence

A review that sees the hand-mirrored interfaces and proposes a fixture or key list should find this ADR first. Reconsider if a Reader payload is ever persisted or cached across versions, if a field drift reaches a release unnoticed, or if codegen is adopted for another reason (then derive the interfaces and delete the mirror).

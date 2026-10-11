# ADR-104: No Shared Fake for One-Shot IPC in Tests

**Status:** Decided
**Date:** 2026-10-11

## Context

An architecture review (2026-10-11, candidate #3) saw 27 test files assign `window.electronAPI` by hand, two of them (`useChapterOutline.test.ts`, `ChapterOutlineStore.test.ts`) with the same 18-line block, the only clone fallow reports, and proposed a shared fake IPC adapter beside `src/test/fakeAppFile.ts`, `fakeConfigDisk.ts` and `wireTransformRulesIpc.ts`.

## Decision

Do not add it.

- **The stubs are the assertion handles.** Each stub forwards to a per-test `vi.fn` that the test then asserts on (`detectChapterOutline`, `readBookLines`, `openBook`). Deleting a shared fake would put those handles back in each test, with no complexity left behind in the fake.
- **The command subsets differ per test.** A fake with one behaviour per command would have to expose call assertions and let each test pick a subset, so its interface would be about as wide as the stubs it replaces.
- **The existing fakes hold a protocol; one-shot commands do not.** `fakeAppFile`, `fakeConfigDisk` and `wireTransformRulesIpc` share state across a cache, a lock or a disk. A one-shot command has none to share.
- **The clone is two files and 0.06% of the repo.** Sharing the block would couple two tests whose stubs match only today.

This is the test-side twin of ADR-071, which declined Backend modules for the same one-shot commands.

## Consequence

A review that sees many hand-rolled `window.electronAPI` stubs should not read it as missing infrastructure. Add a shared fake when a new command brings state that several tests must keep consistent (a cache, a lock, a disk), as the three existing fakes do, or when a stub block is copied into a third file with the same command subset.

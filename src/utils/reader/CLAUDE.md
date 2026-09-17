# src/utils/reader — Gotchas

## BookRecord field additions touch six sites, not one

Adding a field to `BookRecord` (`src/types/ReaderTypes.ts`) requires updating: the type itself; `BookRecordValidation.ts`'s `validateBookRecord` (parse the raw field, decide its repair-to-default); `BookRecordsBackend.ts`'s `recordBookOpened` (preserve the existing value when refreshing cached fields under the same fingerprint); `ReconcileLibrary.ts`'s `applyReconciliation` (preserve on relink/rename); and every test file with a `makeRecord`/`rawRecord` fixture literal (`BookRecordValidation.test.ts`, `BookRecordsBackend.test.ts`, `ReconcileLibrary.test.ts`) — a fixture missing the field type-checks fine (test files are excluded from `tsc`, see root `CLAUDE.md`) but silently drifts from what production code actually returns.

## Windowed translation is four seams that must stay wired together

`TranslationWindow.ts` (pure arithmetic) and `TranslationChunkCache.ts` (LRU) decide everything; `src/hooks/useWindowedTranslation.ts` is the only place that schedules and calls the engine. Three signals have to reach it, and each one fails silently rather than loudly when it does not:

- **`linesVersion` from `useBookLines`.** `getLine` is referentially stable and reads through a ref, so nothing downstream can tell from its identity that new lines arrived. `planChunks` stops at the first unfetched line — without `linesVersion` in the fill effect's deps, a plan blocked on a page still in flight is never re-planned, and the region stays Chinese forever with no error.
- **`engineVersion` from `useEngine`, passed as `dictionaryVersion`.** A change clears the whole cache. Drop it and a reload leaves the previous engine's translations on screen.
- **`isEnabled` gated on the Reader being the visible tab.** `translateWithSegments` resets engine-wide segment state on entry, so the single shared engine serves exactly one caller at a time. Removing the gate lets a background Reader fill race the Translator tab's own call.

**Bands are nested by construction, and the keep band is not decoration.** `keep` (±6 viewports) is much wider than `fetch` (±2) so that crossing the fetch boundary repeatedly evicts nothing — collapsing them to one threshold reintroduces exactly the thrash the second band exists to prevent, and the symptom is a re-translation cost, not a visible bug.

**Chunk size is two numbers, not one.** `CHUNK_TARGET_CHARS` (600) is what packing aims at; `CHUNK_CEILING_CHARS` (1200) is the hard limit, because word-level highlighting silently drops candidates above roughly that many characters _per engine call_ — no error, no partial result, just an untagged tail. Raising the target without re-checking the ceiling is how that gets reintroduced. Both are overridable per call (`planChunks(range, getLine, lineCount, {targetChars, ceilingChars})`) so the spec's "re-confirm the chunk size in the real app" can be done without editing the module.

**A chunk key must stay a pure function of the book's text — two rules in `planChunks` exist only for that, and both look like inefficiencies.**

1. **A chunk never spans a paragraph; packing restarts at every paragraph's own first line.** The snapped fetch band starts at a different paragraph every time the anchor crosses one, so greedy packing carried across paragraph boundaries gives the same lines a different span — and so a different key — on almost every scroll. The symptoms are re-translation of text already cached, plus the same lines rendered twice where two differently-keyed spans overlap (`assembleTranslatedLines` concatenates per line, which is what `splitLongLine`'s sub-line pieces need). The cost is more, smaller calls where paragraphs are short.
2. **A paragraph with an unfetched line on either side is skipped entirely, not planned over its visible part.** A chunk minted over a prefix is a key the full paragraph will never match, so both would sit in the cache and both would render. `linesVersion` is what brings the paragraph back once its page lands.

**The anchor is `computeAnchor`'s line, not `virtualRows[0].index`.** The virtualizer's item list includes `OVERSCAN_ROWS` above the viewport, so the first rendered row is about a screenful above the reader. `BookReader` still uses `firstIndex` for the chapter strip and chapter stepping, which is the older, separate convention — don't unify them without checking which one each caller wants.

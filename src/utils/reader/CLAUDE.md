# src/utils/reader — Gotchas

## A required field added to a shared type lands silently in every test fixture

Test files are excluded from `tsc` (see root `CLAUDE.md`), so a fixture literal missing a newly required field type-checks fine and silently drifts from what production code actually returns — grep the type's name for fixture literals as part of the change, not after. `CachedChunk.characterOnlyText` hit this; `BookRecord` (`src/types/ReaderTypes.ts`) is the expensive case, needing six sites: the type itself; `BookRecordValidation.ts`'s `validateBookRecord` (parse the raw field, decide its repair-to-default); `BookRecordsBackend.ts`'s `recordBookOpened` (preserve the existing value when refreshing cached fields under the same fingerprint); `ReconcileLibrary.ts`'s `applyReconciliation` (preserve on relink/rename); and the `makeRecord`/`rawRecord` fixtures in `BookRecordValidation.test.ts`, `BookRecordsBackend.test.ts` and `ReconcileLibrary.test.ts`.

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

## Cross-panel sync is line-indexed, and the latch is not optional

`PanelSync.ts` maps a reading position between the three Reader panels as a **line index plus a sub-line fraction**, never a pixel ratio. With tens of rows visible out of 75,000+, almost every row is unmeasured, so each panel's total height is a large, shifting estimate; `scrollTop / scrollHeight` compounds three of those errors and grows worse with distance from the measured region. A line index has zero error by construction, and the fraction's error is bounded by one line height at the one place alignment is looked at.

`usePanelSync` writes follower offsets from an **animation-frame-throttled scroll handler**, not from the anchor `BookReader` publishes for persistence and translation scheduling. The two are deliberately separate: the durable anchor can afford to arrive late, follower pixels cannot — a lag there is visible as the left panels trailing the right one during a drag.

**The "who is driving" latch is load-bearing.** Writing a follower's `scrollTop` makes that follower fire its own scroll event; without the latch that echo drives the driver back, and because scroll offsets are fractional the round trip is lossy — the panels walk apart rather than merely oscillating. The latch clears on the _next_ frame, which is when the echo lands; clearing it synchronously after the writes catches nothing, and it is set only when a write actually happens, so a frame that changes nothing does not swallow the scroll that follows it.

**The followers do not scroll themselves.** The translation panel is the scroll master; the reference panels are `overflow: hidden` (`.readerFollower`) and move only when the sync writes them — a wheel over one is forwarded to the master instead. That is what keeps the measurement resync (`resync()` on any panel's total size changing) from fighting a drag: a follower's rows measure as it moves, and if the reader could also drag it, that resync would snap it back mid-gesture.

**The character-only gloss is a second engine pass, run after the translation is published.** `useWindowedTranslation` sets the chunk with `characterOnlyText: null`, rebuilds, and only then calls `translateGloss` — folding both into one `translateChunk` doubles the latency of every window fill for a panel that is reference material. A `null` gloss is left out of the assembled lines entirely; assembling it as `''` would blank the reference panel instead of leaving the Chinese showing.

`@tanstack/react-virtual` v3: `virtualizer.measurementsCache` is the public per-index array (measured where mounted, `estimateSize` elsewhere) — `getMeasurements()` is private, and `getOffsetForIndex()` clamps to the max scroll offset, so it is wrong for a raw row top and right for a scroll target.

**Unmeasured rows are estimated per index, never by a fixed height.** `estimateRowSize` scales the line's Chinese character count by the panel's own `emPerChar` and biases it slightly upward. A fixed skeleton height fails differently in kind, not degree: its error is systematic, so long lines are underestimated every time and the error accumulates monotonically down the document instead of cancelling.

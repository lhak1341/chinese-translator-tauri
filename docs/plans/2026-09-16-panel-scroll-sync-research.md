# Research: scroll-syncing three panels with divergent line heights over a 75,514-line document

Findings for [issue #13](https://github.com/lhak1341/chinese-translator-tauri/issues/13). Research only — no implementation, no decision recorded. Branch `research/panel-scroll-sync`.

Primary sources are cited inline. Repo claims are cited as `path:line` and were read directly, not inferred.

---

## 1. What this repo already uses for lists and scrolling

**No virtualization library is installed.** `package.json` runtime dependencies are: `@tauri-apps/api` + five Tauri plugins, `lucide-react`, `react` 19.2.8, `react-dom` 19.2.8, `react-resizable-panels` 4.12.3. Nothing else. (Note for the ticket's framing: this is React **19**, not 18.)

**Virtualization does exist — hand-rolled, and fixed-height by construction.**

`src/hooks/useVirtualScrollRange.ts` is the windowing engine. Its arithmetic assumes every row is the same height:

```ts
const totalHeight = totalItems * itemHeight;
const rawStart = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
const visibleCount = Math.ceil(containerHeight / itemHeight);
const endIndex = Math.min(totalItems, startIndex + visibleCount + buffer * 2);
```

`itemHeight` is a scalar option, not a function of index. There is no measurement cache, no per-row measurement, and no offset table — `index → offset` is a multiplication. This hook cannot represent variable rows without being replaced, not extended.

Its only consumer is `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`, which passes `ITEM_HEIGHT = 40` (`src/components/dictionary/TableBuildingBlocks.tsx:13`). The rendering shape is the standard one: an outer `overflow: auto` scroller, a spacer div of `height: totalHeight`, and an inner block positioned with `transform: translateY(offsetY)`.

Supporting pieces that already exist and are reusable:

| File                                                                 | What it does                                                                                                                                                                                                                | Relevance                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/hooks/useVirtualScrollRange.ts`                                 | Windowing; `ResizeObserver` on the **scroller** (tracks `containerHeight` only, never row heights); `adaptiveBufferCalculator` resizes the overscan buffer from device performance and scroll velocity on a 100 ms debounce | Fixed-height only                                                                              |
| `src/utils/ui/ScrollPositionRecovery.ts`                             | Generic retry/backoff driver for "restore scroll once the DOM is ready"; caller injects an `AttemptFn`; `scheduler: 'raf'` polls at frame cadence                                                                           | Reusable as-is for Q6                                                                          |
| `src/hooks/useVirtualScrollRange.ts` → `buildScrollRestoreAttempt()` | Rejects the first 3 frames, then requires `container.scrollHeight > 0`, then **force-writes** on attempt 60 (`SCROLL_RESTORE_MAX_ATTEMPTS`) so a restore request is never silently dropped                                  | The right shape for Q6; only the attempt body changes                                          |
| `src/hooks/useScrollPositionManager.js`                              | Saves/restores raw `scrollTop`/`scrollLeft` for all three translator panels across a dictionary reload                                                                                                                      | Pixel-based — correct for "same content re-rendered", wrong for "different content, same line" |
| `src/utils/highlighting/ScrollHelpers.ts`                            | `scrollToHighlightedElement(ref, unitIndex)` → `querySelector('[data-unit-index="N"]')` → `scrollIntoView({behavior:'smooth', block:'center'})`                                                                             | **Already line-anchored**, just discrete                                                       |

**The three translator panels are not virtualized and are not scroll-synced.** `src/components/translator/TranslatorDisplayPanels.tsx` renders whole text into three independent `.scrollableContent` scrollers (`src/styles/TranslatorDisplayPanels.module.css`: `position: absolute; top/left/right/bottom: 1rem; overflow-y: auto !important`). There is no `onScroll` handler on any of the three, and no continuous sync anywhere in `src/components/Translator.jsx` — the only cross-panel scroll coupling is the discrete click-to-highlight jump via `ScrollHelpers`.

**`IntersectionObserver` appears nowhere in `src/`.** `ResizeObserver` appears only in `useVirtualScrollRange.ts` (and tests). No Reader component exists yet — there is no `src/components/reader/`.

**Conclusion for Q1:** nothing needs to be _added_ to have windowing in the abstract; the repo has a working windowing hook and a working scroll-restore retry driver. But the windowing hook is structurally fixed-height, and the one existing anchor mechanism (`data-unit-index` + `scrollIntoView`) is per-semantic-unit and fires only on click. Both the variable-height requirement and the continuous-sync requirement are genuinely new.

---

## 2. The established technique for syncing panes with divergent, unknown heights

The technique is **anchor-based (line-anchored) scroll synchronization**: one pane is the master, it publishes _which line index is at a chosen viewport reference point_ plus a sub-line fraction, and each follower resolves that index to its own pixel offset through its own measurement data. Pixel offsets and percentages never cross the panel boundary.

There are two variants in the wild, and they differ in whether the panes are made geometrically identical first.

### Variant A — alignment/spacer sync (make the geometry match, then share one offset)

Diff and merge editors do this. CodeMirror's `@codemirror/merge` `MergeView` "manages two editors side-by-side, highlighting the difference between them and **vertically aligning unchanged lines**" ([CodeMirror reference manual, `@codemirror/merge`](https://codemirror.net/docs/ref/#merge.MergeView)). Once corresponding lines occupy the same y in both editors, a single scroll offset is valid for both and sync becomes trivial. `MergeConfig.collapseUnchanged` exists for the same reason — shrinking the parts that don't need alignment.

Cost: every line's rendered height becomes `max(height across panes)`, and the shorter pane gets visible dead whitespace. For a Chinese/Vietnamese pair where the Vietnamese is systematically longer, the Chinese panel would be mostly padding. This variant trades layout honesty for sync simplicity.

### Variant B — anchor-index sync without alignment (each pane keeps its own geometry)

Each pane keeps its natural heights, and the mapping is per-pane:

```
anchorIndex, fraction  ←  master
followerTop = offsetOf_follower(anchorIndex) + fraction * heightOf_follower(anchorIndex)
```

`fraction = (masterScrollTop − offsetOf_master(anchorIndex)) / heightOf_master(anchorIndex)` gives sub-line precision, so the sync is smooth rather than stepping line by line.

This is exactly the primitive virtualization libraries expose: TanStack Virtual's `scrollToIndex(index, { align: 'start' | 'center' | 'end' | 'auto', behavior })` and React Virtuoso's `scrollToIndex({ index, align, offset })` — both are "put _this index_ at _this reference point_", which is the follower half of variant B. (Sources: [TanStack Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer), [Virtuoso Scroll to Index](https://virtuoso.dev/react-virtuoso/virtuoso/scroll-to-index).)

### Why percentage/pixel sync is wrong here

Proportional sync (`followerTop = masterTop / (masterScrollHeight − masterClientHeight) × (followerScrollHeight − followerClientHeight)`) is correct only when the panes' cumulative-height functions are proportional. They are not: Vietnamese expansion is per-line and varies with content, so the Chinese panel's height-vs-line curve and the Vietnamese panel's are different _shapes_, not different scales. Proportional sync is exact at both ends and wrong in the middle — which is the worst failure mode, because it looks correct when you test it at the top.

### Two mechanics that anchor sync always needs

**Feedback-loop suppression.** Writing `element.scrollTop` programmatically fires a `scroll` event on the follower, which would drive the master back. The standard fix is a "who's driving" latch: set a flag before writing follower offsets, clear it on the next animation frame, and ignore follower scroll events while set. `Element.scrollTop` is a settable property ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop)), and scroll events fire in response to any scroll-position change; MDN notes scroll events can fire at a high rate and recommends throttling handlers to `requestAnimationFrame` ([MDN scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event)).

**Subpixel drift.** `scrollTop` is a `double` in CSSOM-View, not an integer. Round-tripping master → fraction → follower → (follower's own scroll event) → master accumulates drift unless the latch above breaks the cycle every frame.

### Where `IntersectionObserver` fits — and where it doesn't

`IntersectionObserver` is the right tool for _"which line is the user reading"_ as durable state. Options are `{ root, rootMargin, threshold }`; entries carry `boundingClientRect`, `intersectionRatio`, `isIntersecting`, `target`, and `time`, and MDN advises ordering by `entry.time` since multiple entries can arrive in one callback ([MDN Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)). Shrinking the root to a thin band with a negative `rootMargin` (e.g. `0px 0px -95% 0px`) turns "which row is at the top edge" into a callback instead of a per-frame computation. It is widely available (since March 2019).

It is the **wrong** tool for driving the follower panels' pixel positions: the callback is asynchronous and delivered at the next frame or later, so followers would lag the master visibly during a drag. Split the responsibilities — `IntersectionObserver` for the durable reading anchor (persistence, "you are on line N" UI, translation-window scheduling), a throttled `scroll` handler reading the measurement cache for the frame-accurate follower writes.

---

## 3. How variable-height rows are handled, and what the jitter costs

### The universal mechanism: estimate, render, measure, correct

All three libraries do the same three-step dance, and all three name the same cost.

**You must supply an estimate.** TanStack Virtual's `estimateSize: (index: number) => number` is a _required_ option, and the docs say: _"If you are dynamically measuring your elements, it's recommended to estimate the largest possible size (width/height, within comfort) of your items. This will help the virtualizer calculate more accurate initial positions."_ ([Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer))

**You measure after mount.** TanStack: you attach `ref={virtualizer.measureElement}` plus a `data-index` attribute on each row (`indexAttribute` defaults to `'data-index'`); _"By default the `measureElement` virtualizer option is configured to measure elements with `getBoundingClientRect()`"_, and the observation is driven by a `ResizeObserver` in `virtual-core` ([virtual-core source](https://github.com/TanStack/virtual/blob/main/packages/virtual-core/src/index.ts)). Virtuoso does it automatically: _"Variable sized items out of the box; no manual measurements or hard-coding item heights is necessary"_ ([README](https://github.com/petyosi/react-virtuoso)), storing sizes in an AA-tree of ranges (`packages/react-virtuoso/src/sizeSystem.ts`) so runs of equal-height rows cost one entry, not N. react-window v2 makes it opt-in and warns you off it: `rowHeight` accepts a number, a percentage string, a function of index, or _"dynamic row height cache returned by the `useDynamicRowHeight` hook"_, with _"⚠️ Dynamic row heights are not as efficient as predetermined sizes. It's recommended to provide your own height values if they can be determined ahead of time."_ ([react-window README](https://github.com/bvaughn/react-window))

**The total size is provisional.** TanStack's `getTotalSize()`: _"Returns the total size in pixels for the virtualized items. This measurement will incrementally change if you choose to dynamically measure your elements as they are rendered."_ The scrollbar length is an estimate until every row has been seen at least once.

### The jitter, named by the library that has to deal with it

TanStack exposes `shouldAdjustScrollPositionOnItemSizeChange`, documented as:

> _"Provides fine-grained control over the scroll-position adjustment that fires when an above-viewport item's measured size differs from its estimated size. By default the virtualizer applies this correction only when the user is **not** scrolling backward, which avoids the well-known 'items jump while scrolling up' jank."_

That is the whole trade in one sentence. When a row above the viewport turns out taller than estimated, you either (a) correct `scrollTop` by the delta — which keeps the content visually stable but yanks the scroll position, visibly jumping when scrolling upward — or (b) don't correct — which keeps the scroll smooth but lets the content under the cursor drift. There is no third option; every library picks a default and exposes an escape hatch.

Two more TanStack behaviours worth knowing:

- During smooth scrolling, _"the virtualizer only measures items within a buffer range around the scroll target. Items far from the target are skipped to prevent their size changes from shifting the target position and breaking the smooth animation."_ Corollary from the same note: _"the preferred layout strategy for smooth scrolling is **block translation** — translate the entire rendered block using the first item's start offset, rather than positioning each item independently with absolute positioning."_ The repo's existing dictionary table already uses block translation (`transform: translateY(offsetY)`), so this is a pattern the codebase is consistent with.
- `anchorTo?: 'start' | 'end'` (default `'start'`) controls which side stays stable when data changes — relevant if translated content ever arrives _above_ the viewport rather than into it.

### The measurement trap that silently breaks totals: margins

Virtuoso's troubleshooting page is blunt about this, and it generalizes to any `ResizeObserver`/`getBoundingClientRect` measurer:

> _"Virtuoso measures item sizes using `ResizeObserver`, which reports the `contentRect` of each element. The `contentRect` **does not include margins**. When items have margins, Virtuoso calculates a smaller total height than the actual rendered content, preventing users from scrolling to the end of the list."_

It lists the culprits: `<p>`, `<h1>`–`<h6>`, `<ul>`, `<ol>`, `<blockquote>`, `<pre>` — all of which have default UA margins and all of which are plausible tags for rendering prose lines of a novel. ([Virtuoso troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting)) **Row wrappers must use `padding`, never `margin`,** and any default margins on prose tags inside a row must be zeroed.

### The browser fights you too: CSS scroll anchoring

A virtualizer removes rows and re-translates a block on every scroll frame — exactly the operations scroll anchoring reacts to. Per the [CSS Scroll Anchoring spec](https://drafts.csswg.org/css-scroll-anchoring/), an anchor node is invalidated when the scroll position changes, when a suppression trigger fires, or when the anchor node is removed from the DOM (§2.1.1); suppression triggers include any computed-value change to `top`/`left`/`right`/`bottom`/`transform`, any change to `position` on any element inside the scroller, and _"the scroll offset of the scrollable element being zero"_ (§2.2.2).

The documented opt-out is `overflow-anchor: none` on the scroller — but MDN flags `overflow-anchor` as _"Limited availability… This feature is not Baseline because it does not work in some of the most widely-used browsers"_ ([MDN overflow-anchor](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor)).

**This matters specifically because it is a Tauri v2 app.** Tauri uses the host system webview, so the engine differs per platform: WKWebView on macOS, WebView2 (Chromium) on Windows, WebKitGTK on Linux. Scroll anchoring is a Chromium feature; the same virtualization code will behave differently on macOS and Windows builds. Whichever platforms this ships to should be verified rather than assumed — the failure is subtle (small position corrections that only happen on one OS), not a crash.

### What the jitter costs _at this document's scale_

The scrollbar error is `Σ (actual − estimate)` over all unmeasured rows. With 75,514 lines and a viewport showing on the order of 20–40, roughly 99.95% of rows are unmeasured at any instant. An average estimate error of 4 px yields a total-height error around 300,000 px. That means:

- The scrollbar thumb is a rough position indicator, not a contract. Users dragging it land approximately.
- Any pixel-derived cross-panel mapping compounds **three independent** such errors (three panels, three measurement caches, three estimate curves). This is the arithmetic reason the ticket's premise is right: pixel-offset sync isn't merely imprecise here, its error grows with distance from the measured region.
- Conversely, a _line-index_ mapping has zero error by construction. Line 40,000 is line 40,000 in all three panels. Only the sub-line fraction is approximate, and it is bounded by one line height.

---

## 4. What an untranslated row should render as

The requirement is precise: **the placeholder's height must match the eventual translated row's height closely enough that the swap does not move rows above the viewport.** A row that changes height below the fold is invisible; a row that changes height above the fold triggers the §3 correction/jitter trade.

Ranked by how well each satisfies that:

**1. Estimate per index from the Chinese source, not a constant.** The character count of every one of the 75,514 Chinese lines is known without translating anything. That makes a per-index estimate available immediately:

```
estimatedLines(i) = ceil(chineseCharCount(i) × expansionFactor / charsPerRenderedLine)
estimateSize(i)   = estimatedLines(i) × lineHeight + rowPadding
```

`expansionFactor` is calibrated once from a sample of already-translated lines and can be refined from measured rows as the session proceeds. This turns a constant-error estimator into a correlated one, which is the single biggest available reduction in jitter. TanStack's guidance says to bias the estimate _upward_ (_"estimate the largest possible size… within comfort"_): a row that shrinks on measurement pulls later content up, which reads as settling; a row that grows pushes content down under the pointer, which reads as the page fighting you.

**2. Render the untranslated row as its real Chinese content, styled as pending.** Rather than an invented skeleton box, let the row lay out its actual source text with reduced opacity or a "pending" treatment. The placeholder height then is a _measured_ height, not an estimate, and the only delta on arrival is the Chinese-vs-Vietnamese wrap difference — considerably smaller than box-vs-content. In the character-only panel this is nearly free, since its content is already a per-character transform of the same source. It also gives the user something to read while scrolling ahead of the translator, which a skeleton does not.

**3. Reserve space with `content-visibility` + `contain-intrinsic-size`.** Per MDN, `content-visibility: auto` skips rendering an element's contents while offscreen, and `contain-intrinsic-size: auto <length>` supplies `<length>` as the placeholder size while skipped — with the key property:

> _"Once the browser has actual size information for the element, it will remember this size when the element scrolls offscreen again, and use the remembered size for layout calculations instead of the placeholder value."_
> — [MDN contain-intrinsic-size](https://developer.mozilla.org/en-US/docs/Web/CSS/contain-intrinsic-size)

That is a browser-native measurement cache with no JavaScript. Caveats: `contain-intrinsic-size` is Baseline widely-available (since September 2023) but `content-visibility` is Baseline 2024 "newly available", and — decisively — neither removes DOM nodes. 75,514 row elements is still 75,514 elements. This is a _complement inside the rendered window_, not a substitute for windowing, and its cross-platform behaviour needs the same per-webview check as §3.

**Anti-patterns, with the reason each fails:**

- **A fixed-height skeleton bar.** Its error is systematic, not random: long lines are underestimated _every_ time, so the error accumulates monotonically down the document rather than cancelling. This is the default choice and the wrong one at this scale.
- **Zero-height or `display: none` until translated.** Guarantees a jump, and makes the pre-translation scroll geometry meaningless.
- **`margin` anywhere on the row wrapper or the prose tags inside it.** Silently under-reports the measured height (§3), and the under-report is _per row_, so it compounds.
- **Changing the box model on swap.** The placeholder and the final row must be the same element with the same `padding`, `line-height`, `font-size`, and width; only the text node changes. Otherwise the measured delta includes chrome, not just text, and the estimate calibration in option 1 is measuring the wrong thing.

---

## 5. Can the translation window and the virtual window be one definition?

**No. They must be separate ranges with separate sizes — but derived from one shared anchor, with the translation range a strict superset of the render range.**

The reasons are concrete, not stylistic:

**Asymmetric cost of being wrong.** Dropping a row out of the render window costs a re-render. Dropping a line out of the translation window costs re-running the 5-phase pipeline for that line. Those differ by orders of magnitude, so they want opposite policies: the render window should track the viewport tightly to keep the DOM small; the translation window should have wide hysteresis and shrink lazily, if at all.

**Different update frequency.** The render range changes every scroll frame — it is `[startIndex − overscan, endIndex + overscan]`, and TanStack documents `overscan` (default 1) purely as a render-cost trade. This repo's own `adaptiveBufferCalculator` already recomputes the buffer from scroll velocity on a 100 ms debounce (`src/hooks/useVirtualScrollRange.ts`). A translation window driven off that number would re-trigger the pipeline on every flick of the wheel.

**Ordering constraint — translation must lead rendering.** If a row is allowed to mount before its translation exists, it measures at placeholder height and then changes height once content arrives. That is precisely the §3 jitter source, self-inflicted. The invariant is `translateRange ⊇ renderRange` with margin, so that by the time a row mounts, its content is final and its first measurement is its last.

**Different granularity requirements.** This codebase's consumed-token contract (`*_consumed` → `translated` must be `null`) and `getSourcePriority()` discriminator make partially-translated line state hazardous — a line is translated as a whole unit. So the translation window's boundaries must snap outward to whole-line (and ideally paragraph) boundaries. The render window has no such constraint; it can begin and end anywhere.

**What they genuinely share is the anchor, not the range.** One number — `{ anchorLineIndex, subLineFraction }` — published by the master panel. From it:

- each panel derives its own render range through its own measurement cache (three different ranges, because three different heights);
- the translation scheduler derives its own range, centred on the same anchor, sized in viewports rather than rows;
- the session persistence layer stores it (see §6).

Rough sizing the evidence supports: `renderRange` ≈ viewport lines + overscan (tens of rows). `translateRange` ≈ anchor ± several viewports (hundreds to low thousands of lines), with a _keep_ band strictly larger than the _fetch_ band so that scrolling back and forth across a boundary does not thrash the pipeline. The two bands are the standard hysteresis pattern; a single threshold oscillates.

---

## 6. Restoring scroll to a specific line when earlier rows were never measured

**The accepted answer is to stop restoring a pixel offset. Persist an index, and let the virtualizer place it.**

### Persist `{ lineIndex, subLineFraction }`, not `scrollTop`

Both mature libraries have a first-class mount-time API for this:

- **React Virtuoso — `initialTopMostItemIndex`**: _"changes the initial location of the list to display the item at the specified index. You can pass in an object to achieve additional effects similar to `scrollToIndex`. Note: The property applies to the list only when the component mounts. If you want to change the position of the list afterward, use the `scrollToIndex` method."_ ([Start from a certain item](https://virtuoso.dev/react-virtuoso/virtuoso/initial-index))
- **TanStack Virtual — `scrollToIndex(index, { align, behavior })`** after mount, with `initialOffset` and `initialRect` available for offset-based restores.

Note this makes the three-panel restore _one_ value, not three. The current `useScrollPositionManager` persists three independent `{scrollTop, scrollLeft}` pairs; under line-anchored sync the master's line index is the entire restore state, and the follower panels are placed by the sync mechanism itself.

### Never-measured rows: what actually happens, from the API that says so

TanStack Virtual's `takeSnapshot()` documentation answers the sub-question directly:

> _"Returns a snapshot of currently-measured items as plain `VirtualItem` objects, suitable for round-tripping through state storage and feeding back as `initialMeasurementsCache` on remount. Pair with the current `scrollOffset` to restore exact scroll position after navigation._
> _Only items the consumer has actually rendered (and thus measured) appear in the snapshot; **unmeasured items will fall back to `estimateSize` on restore**. Returns an empty array if no items have been measured."_

So: exact pixel restoration is possible **only** if you restore the measurements alongside the offset. Rows never rendered are simply absent from the cache and fall back to estimates. That is fine — and it is why restoring by _index_ is the correct framing. The target line lands where it should; everything above it is allowed to be approximate, because nothing above it is on screen.

### Consequences to accept, and how to shrink them

1. **The scrollbar thumb will be approximately placed after restore, and will shift as the user scrolls upward through previously-unmeasured rows.** Unavoidable without measuring 40,000 rows at open — which is the cost virtualization exists to avoid.
2. **Scrolling _up_ is the jank-prone direction.** This is why TanStack's `shouldAdjustScrollPositionOnItemSizeChange` defaults to not correcting during backward scroll (§3).
3. **Mitigation A — better estimates.** The per-index Chinese-character estimator from §4 makes the unmeasured region's approximation close rather than arbitrary. This is the highest-leverage fix for restore accuracy, not just for jitter.
4. **Mitigation B — persist the measurement cache between sessions.** `takeSnapshot()` → storage → `initialMeasurementsCache` means re-opening the same book converges toward exact, and a re-read of an already-read region is exact immediately. The cache keys on rendered rows, so it grows with reading rather than with document size.

### Timing: the restore cannot run before layout exists

The restore must not fire until the scroller has been laid out, or it writes into a zero-height container and is lost. **This repo already solved this**, in `buildScrollRestoreAttempt` (`src/hooks/useVirtualScrollRange.ts`):

- reject the first 3 frames outright — _"a freshly remounted virtualized list reports `scrollHeight === 0` before layout settles"_;
- then require `container.scrollHeight > 0`;
- then **force-write on the final permitted attempt** (60) regardless of readiness, so a restore request is never silently dropped;
- driven by `ScrollPositionRecovery` with `scheduler: 'raf'` for frame-cadence polling.

Only the attempt body needs to change — from "write `scrollTop`" to "call `scrollToIndex(lineIndex)` and verify the row materialised". The readiness gate, the retry cadence, the force-write escape, and the cancellation semantics all carry over unchanged. This is the strongest piece of existing code relative to the new requirement.

---

## Cross-cutting notes

**The follower-panel settle.** Three panels means three measurement caches. A follower asked to scroll to a line it has never measured resolves the offset from estimates, lands approximately, then corrects once the row measures — visible as a small settle. Two reducers: give every panel the same character-count-derived estimator (§4), and keep translation ahead of render (§5) so a row's first measurement is also its last.

**`react-resizable-panels` interaction.** Panel resize changes every panel's width, which changes every line's wrap, which invalidates **every** measured height in all three caches simultaneously. A resize is a full cache invalidation, not an incremental one. Worth treating explicitly: the anchor line index survives a resize (it is width-independent); the pixel offsets do not. The natural behaviour is to capture the anchor before the resize and re-place it after — the same `scrollToIndex` path as §6, which is another argument for making the anchor the single source of scroll truth.

**Measurement is `getBoundingClientRect`-shaped, therefore layout-synchronous.** Both TanStack's default `measureElement` and the general pattern force layout on read. Measuring rows inside a scroll handler is a read-after-write hazard; the libraries batch through `ResizeObserver` callbacks specifically to avoid it. Hand-rolling variable-height measurement means re-deriving that batching discipline, which is a real argument against extending `useVirtualScrollRange` in place.

---

## Source index

| Claim area                                                                                                                                                                                                                                                                          | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Estimate/measure/correct, `estimateSize`, `measureElement`, `getTotalSize`, `overscan`, `anchorTo`, `scrollToIndex`, `shouldAdjustScrollPositionOnItemSizeChange`, `takeSnapshot`/`initialMeasurementsCache`/`initialOffset`, block-translation guidance                            | [TanStack Virtual — Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer); [virtual-core source](https://github.com/TanStack/virtual/blob/main/packages/virtual-core/src/index.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Variable sizes out of the box; AA-tree size storage; `contentRect` excludes margins; margin culprits; `initialTopMostItemIndex`; `scrollToIndex` align/offset                                                                                                                       | [react-virtuoso README](https://github.com/petyosi/react-virtuoso); [`sizeSystem.ts`](https://github.com/petyosi/react-virtuoso/blob/master/packages/react-virtuoso/src/sizeSystem.ts); [Troubleshooting](https://virtuoso.dev/react-virtuoso/troubleshooting); [Start from a certain item](https://virtuoso.dev/react-virtuoso/virtuoso/initial-index); [Scroll to Index](https://virtuoso.dev/react-virtuoso/virtuoso/scroll-to-index)                                                                                                                                                                                                                                                                                                               |
| `rowHeight` formats, `useDynamicRowHeight`, "dynamic row heights are not as efficient"                                                                                                                                                                                              | [react-window README](https://github.com/bvaughn/react-window)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Vertical alignment of unchanged lines as the merge-view sync strategy; `collapseUnchanged`                                                                                                                                                                                          | [CodeMirror 6 reference — `@codemirror/merge`](https://codemirror.net/docs/ref/#merge)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scrollTop` settable/`double`; `scrollIntoView` `block`/`behavior`; scroll event rate and rAF throttling; `IntersectionObserver` options and entry fields; `ResizeObserver`; `content-visibility`; `contain-intrinsic-size` remembered size; `overflow-anchor` limited availability | MDN: [scrollTop](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop), [scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView), [scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event), [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API), [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver), [content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility), [contain-intrinsic-size](https://developer.mozilla.org/en-US/docs/Web/CSS/contain-intrinsic-size), [overflow-anchor](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor) |
| Anchor node invalidation; suppression triggers                                                                                                                                                                                                                                      | [CSS Scroll Anchoring Module Level 1 (CSSWG ED)](https://drafts.csswg.org/css-scroll-anchoring/) §2.1.1, §2.2.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Repo state                                                                                                                                                                                                                                                                          | `package.json`; `src/hooks/useVirtualScrollRange.ts`; `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`; `src/components/dictionary/TableBuildingBlocks.tsx:13`; `src/utils/ui/ScrollPositionRecovery.ts`; `src/hooks/useScrollPositionManager.js`; `src/utils/highlighting/ScrollHelpers.ts`; `src/components/translator/TranslatorDisplayPanels.tsx`; `src/styles/TranslatorDisplayPanels.module.css`                                                                                                                                                                                                                                                                                                                               |

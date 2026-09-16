# ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`

**Status:** Decided
**Date:** 2026-09-16

## Context

The Reader (issue #23, parent spec #21) scrolls a whole novel: 75,000+ logical lines from a 4-16 MB file. Two virtual-scrolling implementations already exist in this repo, so adding a dependency needed justifying against both.

`src/hooks/useVirtualScrollRange.ts` — used by the dictionary table — is **fixed-height**. It takes one scalar `itemHeight`, multiplies, and hands back an index range. It holds no measurement cache, because with uniform rows there is nothing to measure.

Prose lines are not uniform. A line of Chinese wraps to one, two or five rows depending on its length and the panel width, and a novel's line lengths vary by an order of magnitude. Three consequences rule the fixed-height hook out rather than merely making it inconvenient:

1. **Total height is wrong by a growing amount.** With a scalar height, the error per row is systematic rather than random — long lines are underestimated every time — so it accumulates monotonically down the document instead of cancelling. At 75,000 lines the scrollbar becomes fiction.
2. **There is nowhere to put a measurement.** Extending the hook means adding a per-index measurement cache, a `ResizeObserver` per mounted row, and a policy for what happens to the scroll offset when a measured row changes size. That is the whole of a variable-height virtualizer; the "extension" would be a rewrite living inside a hook whose existing caller does not want any of it.
3. **The later panels need three caches from one anchor.** The full spec (#21) puts three panels side by side — original Chinese, character-only, full translation — each with its own row heights, aligned on a shared anchor line. That needs three independent measurement caches driven by one index, which is a shape the current hook's single-scalar interface cannot express.

## Decision

Adopt `@tanstack/react-virtual` for the Reader. Leave `useVirtualScrollRange` untouched and in place for the dictionary table, whose rows really are fixed height.

The library was required to expose three things, all of which #21 depends on:

- **An unstyled primitive**, not a list component — three panels will later need three independent measurement caches driven from one shared anchor, so the virtualizer must be a hook that hands back positions rather than a component that owns the markup.
- **Scroll-to-index with alignment** — resume (a later ticket) persists an anchor line, never a pixel offset, and restores by index.
- **Explicit control over whether scroll position is adjusted when a measured item changes size** — rows change height when their text arrives, and a panel that silently compensates fights the anchor logic.

## Consequences

- One new runtime dependency (`@tanstack/react-virtual`), the first added to this project for the frontend in some time. It is dependency-free itself and framework-agnostic at its core.
- Two virtualization implementations now coexist. This is deliberate and should not be "cleaned up" by migrating the dictionary table: that table's rows are genuinely fixed-height, measurement would cost a `ResizeObserver` per row for no benefit, and the migration would be a behaviour-preserving rewrite of a working, tested surface.
- Row measurement dictates CSS that looks arbitrary without this context, so it is documented where it lives (`src/styles/Reader.module.css`): **no margins** on the row wrapper or the prose element inside it — resize observations exclude margins, so every row would under-report its height and the error would compound per row — and horizontal padding on the scroller rather than the row, so every row measures at the same width.
- The pending (not-yet-fetched) row and the final row are the same element with the same padding, font and line height; only the text node differs. `BookReader.tsx` also prefetches well beyond the rendered range so that a row usually mounts with its text already present.

## Alternatives Rejected

**Extend `useVirtualScrollRange` with a measurement cache.** Rejected for reason 2 above: the extension is the entire feature, and it would be grafted onto a hook whose only current caller needs none of it. Rejected also because the fixed-height path would have to keep working, so the hook would grow a mode switch.

**Write a variable-height virtualizer from scratch.** Measurement caching, scroll anchoring under size changes, and scroll-to-index with alignment are each subtle enough to be worth a dependency, and all three are load-bearing for the spec rather than incidental. This is the same reasoning ADR-040 applied in the opposite direction: there, the in-repo implementation was already on the hot path and the dependency bought nothing after construction cost was accounted for; here, the in-repo implementation does not do the job at all.

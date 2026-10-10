# ADR-049: Keep the Selection-Mapper Registry

**Status:** Decided
**Date:** 2026-09-26

## Context

Architecture review 2026-09-26 (candidate #5, rated Speculative) flagged `SelectionMapping.ts`'s module-level registry: `const mappers = new Set<SelectionMapper>()`. `mapSelectionRange` asks each registered mapper in turn and takes the first answer that is not `unmapped`. The Translator and the Reader both stay mounted, so both mappers are always registered, and no test registers the two real mappers at once. The concern was that registration order could decide which surface answers a selection.

## Decision

Keep the registry and both mappers as they are.

## Reasoning

**At most one mapper can answer, by construction.** Each mapper passes its own panel as the container: the Translator its Full Translation panel (`translationTextRef`), the Reader its Translation panel (`panels.translation.scrollRef`). Both go through `touchedUnits`, which returns `null` (so `unmapped`) unless `container.contains(range.commonAncestorContainer)`. The two panels are disjoint DOM subtrees in different tab panels, and one range lies inside at most one of them, so registration order never matters. The guard is tested directly: `SelectionMapping.test.ts`, "is null when the selection is not inside the container".

**The registry is a real seam.** Cmd-1..6 belong to the Translator and Reader hotkey registrations, but Cmd-7 belongs to the tab container's `'app'` registration, which knows no panel (CONTEXT.md, "Selection mapping"). Without the registry, every hotkey registration would need every surface's mapper handed to it. The deletion test concentrates nothing; it spreads the mappers into the hotkey layer.

Tab gating is unnecessary for the same reason, and `src/components/CLAUDE.md` already says not to add it.

## Consequence

Future reviews should not re-flag the registry's global `Set` or its first-answer rule. Reconsider only if a surface registers a mapper whose container can contain another surface's panel (a mapper keyed on `document.body`, say), or two mounted instances of one surface share a container. Either would let two mappers answer one selection, and then order would matter.

## Addendum (2026-10-10)

Architecture review round 25 (candidate #4) un-exported `mapSelectionRange`: `resolveQuickAddSource` is its only caller, and the registry's behavior (first recognising mapper wins, a throwing mapper counts as unmapped, no selection asks no mapper) is tested through it. `mapSelectedUnits` and `touchedUnits` stay exported on purpose. They are the pure and DOM cores of `mapTranslatorSelection` and `mapReaderSelection`, with direct tests on span order, line-break refusal and snapping to whole units; routing those through the mappers needs a full Translator or Reader fixture each time. A review that sees them exported with no production caller should find this first.

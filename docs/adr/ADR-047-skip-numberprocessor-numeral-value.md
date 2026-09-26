# ADR-047: Skip a Numeral-Value Interface on NumberProcessor

**Status:** Decided
**Date:** 2026-09-26

## Context

Architecture review 2026-09-26 (candidate #7, rated Speculative) noticed two numeral tables: `NUMERAL_VALUES` in `src/utils/pattern/NumberVariable.js` and `NUMBER_MAP` in `src/utils/NumberProcessor.js`, both mapping 零 through 十 to 0–10. It proposed giving `NumberProcessor` a `numeralValue(text)` interface that owns the table and the lone-digit rule, with `NumberVariable` calling it and `convertSequence` no longer exported to it.

The two modules answer different questions:

- **`NumberProcessor` converts numbers inside running text (Phase 3).** It deliberately has no rule for a lone numeral: `standalone_ten`'s converter returns `null` so phrases like 十字架 survive, and a lone 一 in prose is usually "a/one", not the number 1.
- **`NumberVariable` fills a pattern's `#` slot.** There the text is already known to be a number, and a value up to ten reads as a Vietnamese word (`bảy`), not a digit. `translateNumeral` handles lone numerals itself for exactly that reason, and delegates everything longer to `convertSequence`.

## Decision

Do not add `numeralValue` to `NumberProcessor`, and do not merge the two tables. Keep both modules as written.

## Reasoning

The deletion test fails both ways. Replacing `NUMERAL_VALUES` with an import saves twelve constants that cannot drift (Chinese numerals do not change) and adds a coupling. Moving the lone-digit and ≤10-as-words rule into `NumberProcessor` puts slot policy inside the running-text converter, the one distinction here that matters, and gives `NumberProcessor` a method whose answer disagrees with its own Phase 3 behavior on the same input.

`convertSequence` is not a leak: "convert this whole string, or `null`" is a small interface over a 17-pattern implementation, with one internal caller (`findLongestNumberMatch`) and one external (`translateNumeral`).

## Consequence

Future reviews should not re-flag the two numeral tables on sight. The drift that could matter is the character set, not the values: `NUMERAL_CHARS` (digits + 百千万) decides which spans the `#` slot is offered. Reconsider if `NumberProcessor` gains a numeral character outside that set (for example 亿 or 〇) — then `NUMERAL_CHARS` should be derived from `NumberProcessor` rather than hand-kept, or `#` will silently never see those numbers.

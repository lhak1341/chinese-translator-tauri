# ADR-010: Dictionary Match Sort — Specificity Over Provenance

**Status:** Accepted  
**Date:** 2026-05-17

## Context

`DictionaryManager` holds separate trie instances per dictionary name. When multiple dictionaries match the same text position, a sort order determines which match is returned as `filteredMatches[0]` (the winner used by `TranslationEngine`).

Proper noun dictionaries carry priority tiers:

- `properNouns-f_*` — priority 1 (fiction-specific)
- `properNouns-_*` — priority 2 (cross-fiction shared)
- `properNouns` (general) — priority 3

The original sort was **priority first, then length**. This meant a 2-char `f_*` entry silently beat a 3-char general entry at the same position — a shorter, less-specific match from a "more trusted" dictionary would win over a longer, more-specific match from a lower-priority dictionary.

## Decision

Sort by **match length first** (longer wins), with **priority as tiebreak** only when lengths are equal.

```js
// DictionaryManager.js — findAllMatchesSequential + findAllMatchesParallel
if (a.word.length !== b.word.length) {
  return b.word.length - a.word.length; // longer match is more specific
}
return a.priority - b.priority; // priority breaks ties at equal length
```

## Rationale

Match length is a proxy for specificity. A 3-char match covers more characters and is therefore less ambiguous than a 2-char match at the same position. Dictionary provenance (fiction-specific vs general) is a signal about translation quality _when two matches are equally specific_ — it should not override a longer, more precise match from a lower-priority source.

The priority ladder still matters: if `f_*` and general both have a 2-char entry for the same text, `f_*` wins.

## Consequences

- A longer general-purpose entry will beat a shorter fiction-specific entry at the same position.
- Priority differentiates fiction-specific overrides only when lengths are equal — which is the intended use case (overriding a known translation for a specific novel).
- Test coverage: `DictionaryManager.apiContract.test.js` — "DictionaryManager match sort order" describe block (2 tests).

## Alternatives Considered

**Keep priority-first sort:** Allows fiction-specific dicts to fully override general dicts regardless of length. Rejected because it produces shorter (less specific) matches at positions where a longer entry exists, breaking longer proper noun lookups.

**Composite score (length × priority weight):** More nuanced but harder to reason about and tune. Rejected in favour of the clear two-key sort.

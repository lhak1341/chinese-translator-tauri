# ADR-094: Delete the Write-Only Unit Provenance Fields

**Status:** Decided
**Date:** 2026-10-10

## Context

`SemanticArrayMetadata` carried `phase` and `dictionary`, set by `addUnit(originalText, translatedText, source, tokenIndex, phase, dictionary)` and by the progressive placeholder entry. The architecture review of 2026-10-10 (round 26, candidate #1) found that no production code reads either field. The only reader was one test, which used `unit.dictionary === 'phrases'` to pick out the phrase units. `phase` repeated what `source` already says (`'pattern'`, `'phrases'`, `'number_conversion'`, `'characters'`). For proper nouns, `source` is the dictionary name itself.

## Decision

Delete both fields. `addUnit(originalText, translatedText, source, tokenIndex = -1)` takes four arguments. The progressive placeholder is `{ source: 'progressive', isMissing: true }`. `TranslationEngine.addUnitCallSites.test.js` fails if a production call passes more than four arguments, because JS would otherwise ignore a re-added pair without a sound.

## Reasoning

**Nothing reads them.** The fields were provenance for a debugging need that never arrived, and every `addUnit` call paid six arguments for it. Two of the silent-failure rows in `src/utils/CLAUDE.md` (fewer than six arguments, a number passed as `phase`) existed only to describe how to get those two arguments wrong.

**Provenance stays on the match.** ADR-029 keeps `match.dictionary` on the match, where a future caller can use it. A unit that needs a dictionary name later can take it from `source` (proper nouns) or be given the field again with a reader in the same change.

**The one test reader had a better key.** The phrase site passes `'phrases'` as `source`, so the `chunkOffset` test now filters on `unit.source === 'phrases'` and selects the same three units.

## Consequence

Future architecture reviews should not re-add `phase` or `dictionary` to the unit metadata without a production reader. Not done here (resolved by ADR-100): `isMissing` has no production reader either, and the placeholder entry is not a full `SemanticArrayMetadata` (no `index`, `tokenIndex` or positions) although it flows into `SemanticArrayMetadata[]` through untyped JS. Both are left for a separate decision.

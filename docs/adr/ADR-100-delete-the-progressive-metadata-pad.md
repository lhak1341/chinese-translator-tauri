# ADR-100: Delete the Progressive Metadata Pad

**Status:** Decided
**Date:** 2026-10-11

## Context

`snapshotSemanticArrays` (`ProgressiveProgressReporter.js`) copied the builder's arrays and, where `metadata` was shorter than `original`, padded it with one shared frozen entry, `{ source: 'progressive', isMissing: true }`. It came in with the Round 3 code review as a defensive fix. ADR-094 found that `isMissing` has no production reader and that the entry is not a full `SemanticArrayMetadata` (no `index`, `tokenIndex` or positions) although it flows into `SemanticArrayMetadata[]` through untyped JS, and left both as findings. The architecture review of 2026-10-10 (round 26) took them up.

## Decision

Delete the pad: the gap-filling loop, `DEFAULT_METADATA`, `isMissing` and its typedef. `snapshotSemanticArrays` stays as the copy, with its guards for a missing builder. Two tests that fed in short `metadata` are deleted. A new `SemanticArrayBuilder` test pins what the deletion rests on: `getArrays()` returns `original`, `translated` and `metadata` of one length after several units, when empty and after `reset()`, and on a corrupted builder.

## Reasoning

**The branch cannot run.** All three production callers pass `semanticArrayBuilder.getArrays()` (`TranslationEngine.js` for the batch-complete payload and for the progress update, and `FullTextAssembly.ts` for the final result), or an empty set of arrays when the builder is missing. `getArrays` builds all three arrays to `this.length`, `addUnit` writes them together and marks the builder corrupted rather than leave them out of step, and a corrupted builder keeps equal lengths (the unit that corrupted it is in all three). Only the two deleted tests reached the pad, by handing in arrays the builder cannot produce.

**Measured.** A throwaway probe wrapped `snapshotSemanticArrays` and `buildProgressiveProgressUpdate` and translated the 248 windows of the ADR-096 corpus with both callbacks on. The batch updates numbered 9,312 and the snapshot calls 9,560 (9,312 batch-complete plus 248 final assemblies); `metadata` was shorter than `original` in none, with a maximum gap of 0.

**If it ever ran, it would hide the bug.** A placeholder has no `tokenIndex` or positions, so the original-text fast path (which needs every `originalStart >= 0`) would quietly fall back to the greedy scan and highlighting would degrade with no message, while the builder's own corruption check is the thing that reports a real mismatch.

**The copy is separate.** The deep-clone comment is about the next batch mutating arrays React has already scheduled a render from; it is why the arrays are copied, and it stays.

## Consequence

A review that proposes padding the builder's output to a length should first find a way the builder can emit unequal arrays; the new test is where that would show. Not done here: `snapshotSemanticArrays` is JavaScript with `Array<*>` types, so `FullTextAssemblyResult.semanticArrays` is an array of `any` at the Translator boundary, which could be typed as `SemanticArrays`; and `getArrays(copy = false)` and its development-only freeze have no caller outside the builder. Both are separate changes.

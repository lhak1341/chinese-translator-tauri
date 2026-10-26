# Troubleshooting Guide

This guide provides systematic diagnosis frameworks for common translation issues, clickable highlighting problems, cache issues, and development process lessons.

---

## When Translation Is Wrong

**Systematic diagnosis framework:**

### Step 1: Rule Out Stale Dictionary/Config State

```bash
# Click "Reload Dictionary" button (reloads dictionaries + engine config)
```

**Why first**: no translation result is cached anywhere — `TranslationSegmentCache`/`SemanticTranslationCache` have both since been removed from the codebase — but a reload is still the cheapest way to rule out stale in-memory dictionary/config state before debugging logic.

### Step 2: Verify Execution Path

```javascript
// Add at function entry to confirm code is running
console.log('🔍 Function called:', { inputLength: text.length });
```

**Common issue**: Function not called due to configuration state problems or disabled features.

### Step 3: Check Phase Processing

```javascript
// TranslationEngine.js - verify which phases execute
console.log('🔍 Phase A results:', phaseAResults.length);
console.log('🔍 Phase B results:', phaseBResults.length);
console.log('🔍 Final results:', finalResults.length);
```

**Pattern**: Missing results indicate phase not executing or filtering results incorrectly.

### Step 4: Verify Dictionary Entries

```javascript
// Check if entry exists in dictionary
console.log(
  '🔍 Pattern exists:',
  patterns.find((p) => p.originalPattern === '在XY中')
);
console.log('🔍 Priority:', pattern.metadata.priority);
```

**Pattern**: Entry exists but wrong pattern wins due to priority calculation.

### Step 5: Test Pattern Competition

```javascript
// When multiple patterns match same text
// Higher priority wins, check priorities:
console.log(
  '🔍 Pattern competition:',
  matches.map((m) => ({
    pattern: m.pattern.originalPattern,
    priority: m.pattern.metadata.priority,
    lowPriority: m.pattern.metadata.lowPriority,
  }))
);
```

**Solution**: Use `lowPriority: true` flag on overly generic patterns to allow specific patterns to win (−12 priority penalty).

**Archive**: See `docs/archive/pattern-optimization/PATTERN_MATCHING_*.md` for pattern matching algorithm optimizations and troubleshooting.

---

## When Clickable Highlighting Is Wrong

**Which mode, which file**: see ADR-002's Debugging Pattern (`docs/adr/ADR-002-dual-path-clickable-highlighting.md`) — character-only and full-translation are separate implementations. Check `TranslatorDisplayPanels.tsx` first to confirm which panel actually renders the bug, then debug `SegmentPrecomputer.ts` (character-only) or the full-translation segment-building path (`TranslationEngine.js` / `WordSegmentMatcher.ts`) accordingly.

**Diagnostic technique**: add `logger.warn` at segment/unit _creation_ (not at matching) — log the translated text, its length, the position being extracted, and the text actually found at that position in the output. A mismatch between what the semantic array says and what gets extracted is a substring collision or encoding issue.

**Common symptom**: a word split into clickable + non-clickable parts (e.g. "màu" → clickable "mà" + stray "u") — usually a shorter candidate matching inside a longer one; see the "màu" postmortem below for the resolved instance and the current fix location.

**Common symptom**: same character highlights a _different_ instance across panels — check `CharacterOnlyBridge.ts`'s `findCharacterOnlyMatch` for array-index slicing instead of tokenIndex-sorted order (array index reflects chunk _completion_ order, not text order). See the 2026-08-26 postmortem below.

---

## Development Process Lessons

### Lesson 1: Verify Execution Before Fixing Logic

**Pattern**: Modified code multiple times, rebuilt WASM, cleared caches - but function never called.

**Prevention**:

1. **Verify execution path**: `grep "functionName(" src/` - Is it called?
2. **Check expected logs**: Missing logs = code not running
3. **Add entry point log**: `console.log('🔍 Function called')` - Confirm execution
4. **Then fix logic**: Only modify after verifying reachable

**Template**:

```bash
# Step 1: Verify import
grep "processNumbersWasm" src/utils/TranslationEngine.js

# Step 2: Verify invocation (look for actual call with parentheses)
grep "processNumbersWasm(" src/utils/TranslationEngine.js

# Step 3: Check console logs
# Missing = execution path problem, seeing logs = logic problem
```

### Lesson 2: A Fault in One Build Only Comes From a Known Build Difference

**Pattern**: the same commit behaves differently in `bun run tauri:dev` and `bun run deploy`. Check the differences below, in the direction that fails, before reading logic.

- **Fails only in dev:** React `StrictMode` (`src/main.jsx`) runs each effect's cleanup and setup twice on one instance, so a store built in `useState` whose `dispose()`/`close()` cannot be undone goes dead with no error (the Reader never translated in dev until 2026-10-27; rule in `src/utils/reader/CLAUDE.md`). Debug WASM is the other suspect (`wasm-core/CLAUDE.md`'s debug-build panics) but it is only ~5× slower, not broken: rule it out by running the engine on real text with both builds (corpus-ab skill) before chasing it.
- **Fails only in prod:** CSP (relaxed in dev, strict in prod; it once blocked WASM), Vite's production bundling, and `asset://` instead of `http://` loading.

Deploy often (`bun run deploy`) so prod-only faults surface near the change that caused them.

### Lesson 3: Type Boundaries Need Explicit Contracts

**Pattern**: Rust `Option::None` became JavaScript `undefined`, displayed as literal "undefined" text.

**Prevention**:

- Document type conversions at boundaries (Rust ↔ JS, WASM ↔ JS)
- Add runtime validation for WASM responses
- Use TypeScript interfaces for WASM-returned types
- Explicit null handling at all boundary crossings

**TypeScript contract** (add to `types/WasmTypes.d.ts`):

```typescript
interface WasmToken {
  translated: string | null; // Explicit: null allowed, undefined NOT allowed
}

function validateWasmToken(token: unknown): WasmToken {
  if (token.translated === undefined) {
    throw new Error('WASM returned undefined instead of null');
  }
  return token as WasmToken;
}
```

### Lesson 4: Follow Existing Patterns

**Pattern**: First attempt replaced entire array, breaking object references. Should have checked how JavaScript `numberProcessor.processTokens()` works first.

**Prevention**:

- Check existing implementations before adding new ones
- Match modification patterns (in-place vs replacement)
- `grep "processTokens(" src/` - How do others do it?

---

## Error Handling Patterns

Principles only — the code samples and file/line citations previously here (`LazyDictionaryContext.tsx`, old `configValidation.ts` export names, hardcoded WASM return shapes) had drifted from the real implementations across multiple renames/refactors and were removed rather than re-verified line-by-line (2026-08-26 hygiene pass). Read the real current file for the exact shape when applying one of these.

- **Async error boundaries**: React error boundaries don't catch errors in async callbacks — wrap async mutations in try/catch, optimistic-update-then-rollback-on-failure, toast on every outcome, don't re-toast a validation error already shown.
- **WASM graceful degradation**: a WASM processor that fails to init or throws mid-call should return an empty/neutral result, not propagate — translation continues at reduced quality rather than blocking.
- **Init error recovery**: surface critical initialization failures as a visible, dismissible error state with recovery actions (reload dictionaries / reload app), not a silent crash.
- **Fallback notification**: track _consecutive_ failures (not total) before falling back to a slower path, warn the user exactly once via a boolean flag — a toast on every failure is spam.
- **External data validation**: validate config/dictionary data at the IPC boundary with safe per-field defaults instead of trusting a raw Electron/Tauri result — invalid entries get skipped, not a crash.

---

## Resolved Bug Postmortems

Moved out of root `CLAUDE.md` 2026-08-13 (agent-config-hygiene audit) — the one-line actionable rule stays in `CLAUDE.md`, full narrative lives here.

### "màu" split into "mà" + "u" (Jan 2025)

Semantic array had two entries — "而" → "mà" (2 chars) and "白色" → "màu trắng" (9 chars) — and matching by first-occurrence-in-text let the shorter "mà" match inside "màu trắng" first, splitting one clickable unit into a clickable "mà" plus a stray non-clickable "u". Fixed by sorting candidates longest-first before matching. The original ad-hoc `candidateWords.sort((a, b) => b.translated.length - a.translated.length)` no longer exists at its originally-reported `TranslationEngine.js` location — length-based tie-breaking for same-position candidates is now handled by the unified `compareByTokenIndex` comparator (`src/utils/highlighting/TextPositionMapper.ts`, called from `WordSegmentMatcher.ts` and `SegmentPrecomputer.ts`; see `src/utils/CLAUDE.md`'s "Token ordering by text position" entry). The general pattern still holds: always match longer candidates before shorter ones to avoid substring collisions.

### `useEngineReinitializer.js` WASM-sync-validation status check (file deleted 2026-10-03; see `deleted-symbols.md`)

`useEngineReinitializer.js`'s WASM-sync-validation status check (`'PASS'`/`'FAIL_DIFFERENCES'`/`'FAIL_ERRORS'`) never matched what `DictionaryManager.validateWasmFallback()` actually returns (`'PENDING'`/`'SKIPPED'`/`'PASSED'`/`'FAILED'`) — only `'SKIPPED'` ever matched. In production this meant the success log never fired on a passing sync, and — more importantly — **the user-facing toast warning on a real WASM/JS mismatch never fired either**, since neither `'FAILED'` nor any of the checked strings matched. `useEngineReinitializer.test.js` masked this by mocking `validateWasmFallback` to return the wrong strings the consumer expected, not what the real implementation produces — tests were green while the integration was broken. The mismatch-count toast also read `syncStatus.results.different`, a field that has never existed on the real `results` object (`{tested, passed, failed, wasmErrors, jsErrors}`) — would have printed "undefined mismatches". Fixed: `useEngineReinitializer.js` now checks the real status strings and branches on `results.wasmErrors`/`jsErrors` (not a nonexistent `FAIL_ERRORS` status) to distinguish the two failure toasts; `results.failed` (not `.different`) feeds the mismatch count. `WasmValidationResult.status` and `WasmValidationResults` in `DictionaryManagerTypes.d.ts` were documenting this same wrong contract — fixed to match the real implementation.

**Update 2026-10-02:** that fix was never live. The whole block was gated on `dictionaryManager.wasmInitialized`, which only `SemanticPatternProcessor` sets, so the validation still never ran. The test again faked the property. The runtime check was deleted (ADR-058) and parity became a shared-fixture test.

### Pattern substitution and constructor option, 2026-07-30

Found via architecture review candidate #3 grilling — unskipping a stale `TranslationEngine.integration.test.js` block surfaced both:

1. `SemanticPatternProcessor.convertPrioritizedPatternToMatchResult` (`src/utils/pattern/SemanticPatternProcessor.js`) hardcoded `.replace('X', ...)` for every variable token regardless of which variable it actually filled. Any pattern with 2+ distinct variables (e.g. `"X的Y"`, or ADR-004's own canonical `"在XY中"` example) only ever filled the first one — the second `.replace('X', ...)` found no more literal `'X'` in the template and silently no-op'd, leaving `'Y'` untranslated in the output. (**Correction 2026-10-11:** this method was unreachable. Nothing in production ever set `token.prioritizedPattern`, so the path never ran; both it and the JS matcher are deleted, ADR-101. The fix and test below describe the code as it was.) Fixed: substitution now uses `pattern.tokens[i - startIndex].name` (the actual declared variable letter) instead of a hardcoded `'X'`. Regression test: `SemanticPatternProcessor.test.js`'s "prioritizedPatterns — multi-variable substitution" block — confirmed the bug reproduces exactly (`"Y của mèo"` instead of `"chó của mèo"`) by reverting the fix and rerunning.
2. `TranslationEngine`'s constructor hardcodes `this.settings.enableTwoPhasePatterns = true` — passing `enableTwoPhasePatterns` as a constructor option does nothing at all. The real (previously unwired) contract is `initialize(dictionaries, options)`'s `options.patternSettings` — already declared in `TranslationEngineTypes.d.ts` (`TranslationEngineInitOptions.patternSettings?: PatternProcessingSettings`) but never once referenced in the real implementation before this fix. Fixed: `initialize()` now merges `options.patternSettings` onto `this.settings` if provided. (**Correction 2026-10-21:** only a test ever passed it. The setting, the option and `this.settings` are deleted, and whether Phase 1 runs is the Pattern Store's decision, ADR-101 addendum 2026-10-21. The fix above describes the code as it was.)

### Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`

Wired `semanticArrayValidator.validateAllPositions()` (checks `translatedStart`/`translatedEnd`) into `TranslationEngine.js`'s per-phase `checkSemanticArrayCorruption` — broken on two independent counts: those fields stay `-1` until `postProcess` sets them _after_ all 5 phases finish (so the check read not-yet-computed data on every one of its 5 call sites, 100% false-positive toast on every translation), and even once set they're documented as char-only-exclusive — never read by the full-translation highlighting path this engine serves. Reverted; see `src/utils/CLAUDE.md`'s `checkSemanticArrayCorruption` entry for the field-timing detail. `hasValidPositions`/`validateAllPositions` are dead again with no known safe integration point on the full-translation path.

### Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26

`findCharacterOnlyMatch`'s context-window scoring (`segmentsBefore`/`segmentsAfter`) sliced `sourceArrays.original` by raw array index around `sourceIndex`, assuming array-adjacent meant text-adjacent — false under `processChunksInParallel`'s completion-order scrambling. The sibling `occurrenceInSource` count already guarded against this via `tokenIndex` comparison; the context window didn't, so it could feed scoring the neighbors of a physically-adjacent-but-textually-unrelated chunk, sometimes outscoring the true neighbors — intermittent, timing-dependent. Reproduced with a synthetic scrambled fixture (pure function, no real chunking) in `CharacterOnlyBridge.test.ts`. Fixed: sort by `tokenIndex` before slicing, matching `WordSegmentMatcher.ts`/`SegmentPrecomputer.ts`'s existing pattern.

### Pattern-template variable substitution corrupted fused letters in both JS and Rust independently, 2026-09-10

`赤姓老者` → template `"X họ Xích"` produced `"Lão giả họ lão giảích"` instead of `"lão giả họ Xích"`. Root cause: both `SemanticPatternProcessor.js::buildResult()` and `wasm-core/src/pattern_processor/matcher.rs::build_result()` independently substituted the variable letter `X` anywhere it appeared in the template, including fused inside the fixed word `Xích`. Fixing only the JS side (and its sibling `convertPrioritizedPatternToMatchResult`) produced green vitest tests but left the bug live in `bun run tauri:dev`, since vitest's WASM init fails (`ECONNREFUSED`) and falls back to JS silently — the Rust implementation was never exercised. Fixed both sides using the same fused-letter guard `PatternTemplateEngine.isVariableChar` already used elsewhere (the "Yến" case, `PatternEntryRules.ts`). Closed the drift risk with a shared cross-language fixture, `test-fixtures/build-result-parity.json`, asserted by both `PatternBuildResult.parity.test.js` and `matcher.rs`'s `mod tests::parity` (see `docs/guides/gotchas.md`'s cross-language fixture entry for the established convention). A follow-up idea — warning at persist-time when a new pattern's template has this shape — was grilled and dropped: `PatternEntryRules.ts::checkVariableSymmetry` already hard-blocks the one case worth catching (see `src/components/dictionary/CLAUDE.md`'s Pattern Variable Contract entry).

### Every Candidate finder Add re-ranked the whole list, 2026-10-26

`useCandidateFinder` built the pattern coverage test in a `useMemo` over the live `dictionaries`, and `rank` depended on it. The Dictionary Store hands out a new dictionaries object on every write, so each Add rebuilt the test and the panel re-ranked every survivor, about 3 s on the main thread (Bun, synthetic strings), while two comments said only a rule edit re-ranks. A memo dep on live `dictionaries` re-runs on every Add: read a run's dictionaries once, when it starts. Fixed by applying the test when the run lands (ADR-111 addendum 2026-10-26); `useCandidateFinder.rank.test.ts` pins `rank`'s identity.

## Verifying Claims Before Acting

Moved out of root `CLAUDE.md` 2026-08-17 (agent-config-hygiene restructure) — the discipline is genuinely global, but the dated instance log had grown into one unbounded paragraph. The rule: **verify any specific claim — from an Explore subagent, a saved architecture-review report, an ADR, a `.d.ts` file, or a `GLOSSARY.md`/`CLAUDE.md` entry — with a direct `Grep` or `Read` before acting on it, especially before deleting or refactoring based on "unused" or "nonexistent."**

**Explore subagents fabricate specific technical details** — method names, usage counts, file paths, exact quoted comment/code text, and recency/commit-age claims (seen: an invented "CODE REVIEW FIX" comment conflated from a different file; a "this was added one commit ago" claim that git blame traced to the initial migration instead). This includes claims baked into a saved architecture-review HTML report from a prior run, not just live subagent replies — a report card naming the wrong file or citing a nonexistent test still needs re-verification before you build on it.

**A subagent's "no ADR forbids it" is itself a claim to verify.** The rule: before presenting a candidate, grep its own symbols, its EXISTING module names and its proposed names (`useAppConfig`, `substitute_dictionary_reference`, `WasmCascadeRegistry`) across `docs/adr/`, `GLOSSARY.md` and `deleted-symbols.md`, read the target file's header and block comments for "deliberately excludes" (a decision can live only there: `callTauriCommand`'s, 2026-09-09), and run `grep -il "re-propos\|should not restore" docs/adr/*.md` (35 ADRs end with a ruled-out direction). 2026-10-06: the vetting agent cited ADR-052/055/059 and said "none forbids", missing both ADR-060 (rename's config edit) and GLOSSARY.md's "There is no `useAppConfig()` hook". Neither was a topic-area match. 2026-10-08: the round-20 report missed ADR-083's "`WasmCascadeRegistry` stays" and ADR-070's "one owner" for candidate #3; both surfaced only in the grilling. Vet two more sources the same way: the last 3 round commits (`git show --stat`; 2026-10-09 round 22 #2 re-proposed the `TranslateTextOutcome` work round 21 shipped hours earlier) and the root `CLAUDE.md` "Cannot extract" list (`setState`, refs, 10+ parameters; the same card's extraction needed ~14 inputs).

**A background review agent reports on the tree as it was when the agent read it, not as it is when you read the report** — edits made while it runs produce findings describing code you already deleted, and a stale finding is indistinguishable from a live one (2026-09-17: a `/code-review` spec agent flagged a helper deleted mid-run in response to the sibling standards agent's own finding). Either hold edits until every review agent reports, or re-verify each finding against the current file before acting.

**The user's quoted example is a claim too — a paraphrase of data, not the data.** Grep the real app-data file for it before designing a rule around it (2026-10-25: "covered by `#星卡片`" was `#星X` with X = the phrase `卡片`; a filter built for literal `#`+text patterns shipped, missed the case, and needed a second deploy).

**A symbol's apparent wiring is not its call graph, and the mistake runs both ways.** Dead-code sweeps have been fooled by exports whose only caller is their own test — verify "has a test file" separately from "has a production caller". The inverse costs more and hides longer: a method with a detailed doc comment, a `@example` showing the call, and a stated purpose can have zero callers. `DictionaryManager.dispose()` documented itself as existing "to prevent 2-10MB memory leaks per reload" and was never called by anything; `destroy()` called `clearCache()` instead, leaking every trie and the WASM dictionary engine once per reload for months. `grep -rn 'name' src | grep -v __tests__` before trusting that a cleanup path runs.

**When verifying a "zero callers" dead-code claim, re-check that the caller search didn't exclude the target file's own directory** — a sibling file in the same directory is a legitimate caller (caught twice: 2026-07-18, `BackgroundCleanupManager`/`ComponentMemoryProfiler` were "dead" only because the grep excluded `src/utils/memory/` itself, missing `SmartMemoryCoordinator.ts` next door). A "trivial body, therefore dead" conclusion needs the same check even when the trivial-body fact is true — a wrapper can still be a load-bearing named seam. Found: `useTranslationResults.js`'s `setStreamingText` looked like a pure rename with zero behavior, but is a named param threaded across 3 files (`Translator.jsx`, `useAutoTranslateTrigger.ts`, `useReloadRetranslate.js`) via this codebase's `TranslationExecutionContext`/`forceReloadCtx`-style dependency-injection pattern — deleting it would have forced a raw `useState` setter into those contracts instead. A hit can also be a comment, not a call (JSDoc `@example` blocks cite APIs that never existed — 2026-10-03, `TranslationEngine.js`), and "no test covers X" needs the tests directory grepped by property name, not only method name (`manager.stats.*`).

**Deleting a module strands whatever only it used — sweep its imports and definitions after the delete.** Re-grep each helper, constant, toast id, type, dev-dependency and doc/ADR/test-list reference the deleted file touched (2026-10-04, WASM dictionary tier: `validateWasmDictionaryMatch`, `TOAST_IDS.WASM_DICT_FALLBACK`, `PHRASE_PROCESSING`, `aho-corasick`, `WasmCascadeDiscipline`'s wrapper list). A green type-check and suite prove nothing here; orphans compile.

**Architecture-review "duplication" scope is unreliable, not just individual facts** — every candidate from a `/improve-codebase-architecture` report needs its described overlap re-diffed against the real files before designing a fix. Instance log:

- Initial finding: seen overstated (35 claimed lines → ~10 real) and understated (undersold divergence; "not worth it" reversed) in the same session. Ground-truth the actual files, don't design off the report card's line-count claim.
- 2026-07-29 grilling round, for _behavior_ not line counts: a "DictionaryMatchLookup can't be tested without a live DictionaryManager" claim was false (both extractions already had standalone tests with stub closures) — see ADR-035; a "destroyEngine bypasses destroy()" claim was false (it called destroy() correctly). Re-verify behavioral claims, not just duplication-scope numbers, before designing a fix.
- 2026-08-07: candidate #4's "breaks true ties" claim (Rust lookup-index `priority` field carrying an array index instead of the real dictionary priority) traced out to zero behavioral impact — Rust's per-position match collection is always in `dictionaryOrder` order regardless of cross-position parallelism, and the shared comparator's stable sort preserves that same order on a real tie. Fixed anyway as interface honesty/future-proofing, not as a behavior fix — but the report card's "breaks true ties" framing overstated it as an active correctness bug.
- 2026-08-15 grilling round, for _arithmetic_, not overlap/behavior claims: candidate #2's "shrink branch increases batch size 2→3" was mathematically wrong — the guard `currentBatchSize > MIN_BATCH_SIZE` blocks that branch entirely at size 2, so it can't fire at all; real bug was the shrink safety net going silently inert below the floor, not inverting. Candidate #4's "3 sites in one method" diagnostic-check count was also wrong — real split was 2 sites in that method + 1 in a different, unrelated method. Both caught only by re-grepping/re-reading the exact cited code before implementing, not by trusting the report card's numbers.
- 2026-08-16: candidate #1's "SemanticArrayValidator is orphaned, delete it" was half-wrong — `validateArrays` was a byte-for-byte duplicate of `SemanticArrayBuilder`'s live private method, not dead; correct fix was deleting the private copy and delegating to the tested standalone module, not deleting the module. But verifying "zero callers" on the candidate's OTHER two methods (`hasValidPositions`/`validateAllPositions`) didn't guarantee a _found_ integration point was a _correct_ one — a same-session attempt to wire them into `TranslationEngine.js` shipped a live false-positive-toast bug before being reverted (see the postmortem above).
- Confirmed 3-for-3 in the 2026-08-17 grilling round, but for _premise_, not facts/arithmetic: candidate #2's "streaming vs finalized highlighting can visibly diverge" was false — traced to the UI consumer and found the entire streaming-segment output was write-only, never rendered; candidate #1's "45 lines duplicated" was mostly two intentional, tested behavior splits (NFC-normalize, segment-building), not drift — only ~35 lines of real shared spacing logic; candidate #3's dead-code claim was correct, but the test cited as covering that code path didn't actually exercise it (passed by coincidence). Trace every "X and Y diverge/duplicate" claim to its real consumer or test assertion before designing the fix, not just to the cited line numbers.
- Confirmed again the same day, second implementation round (2026-08-17, candidates #2 and #4 grilling): candidate #2's "all three translate methods are dead" was half-wrong — `translateDirectly()`/`translateWithChunking()` are live via a second, indirect call path (`processChunksInParallel`, called from the live progressive-batch path) the original report never traced; only the top-level `translate()` dispatcher was actually dead. Candidate #4's ADR-003 citation was a flat misread — that ADR governs JS-vs-TypeScript migration, not decomposition, and says nothing forbidding the extraction it was cited against. Check every indirect/recursive call path before accepting a "fully dead" claim, and re-read a cited ADR's actual subject before accepting a claimed conflict.
- 2026-07-30 grilling round, for the candidate's own _framing_, not just its facts: candidate #2's "3 tiers" claim was actually 2 orthogonal axes (trie-walk vs WASM-parallel are sub-modes within one axis, not separate tiers); candidate #5's "shared dual-consumer contract" claim overstated fan-out — of `SemanticArrayMetadata`'s 9 fields, only 2 (`tokenIndex`, `source`) are genuinely dual-consumed, 4 are char-only-exclusive, 2 have zero real readers today, and 3 of the original "6 gotchas" cited weren't even about this type (they were Token-level fields on a different data structure). Re-derive the model from real code before writing anything down, not just the individual facts.
- 2026-08-25 grilling round, for _algorithmic_ claims, not scope/premise: candidate 4's `.includes()` "bug" in `CharacterOnlyBridge`'s occurrence scoring reversed outright — a worked example (mixed-granularity source units embedding an earlier textual occurrence) showed removing it would introduce the exact regression it was accused of causing; pinned with a comment + test instead of "fixed." Candidate 3's "2 of 3 siblings sanitize consistently" was also imprecise — real state: `source` unsanitized in all 3, only one sanitized zero of its two free-text fields. Constructing a concrete worked example, not just re-reading the cited lines, is what caught the reversal.
- 2026-09-07 grilling round, for _dead-code scope_: candidate 2's "frequency has zero readers" was correct but incomplete — the deletion-test check was applied to one field, not the whole metadata object. A sibling field (`dictionary`) was equally dead and only found by re-checking against a documented sibling-path precedent in `GLOSSARY.md`; a third field (`priority`) that looked like the same bucket actually had a real reader (`SemanticPatternProcessor.js`'s pattern-priority tie-break). Check every field in a "these are all unused" claim individually, not as one bucket.
- _Severity and stated-reason_ claims err in both directions; trace the setter, run the repro, or read the file's own header before repeating one. 2026-09-07 (under): "precautionary rather than urgent" was wrong — a `reconstructText()` repro with real punctuation-dict mappings (」→curly quote) fired on realistic input. 2026-10-04 (over): "the engine's level gate is a live bug" — `initialize()` forced `debugLevel` to ERROR and nothing raised it, so the gate was dead config; and "the integration test is skipped because it needs WASM" — the file's own header had already shown that false (it was stale against the API).
- 2026-09-08 grilling round, for _premise_ and _coverage_ claims: candidate 2's premise that a mechanized dedup gate could be built was falsified by direct testing (planted a near-duplicate component, ran `fallow find_dupes`, 0 hits — see `docs/guides/development.md`'s fallow item 9) rather than accepted on inspection — downgraded Strong→Speculative only after the empirical test failed. Candidate 3's "7-item checklist, no gate" framing overstated the gap — 6 of 7 items already had real coverage via 3 pre-existing named test invariants (I1/I2/I3 in `useDictionaryCRUD.test.ts`); only 1 item was actually untested. Grep the relevant test file's own invariants before assuming a documented checklist item lacks coverage.

- 2026-09-09 4th architecture review round (3-for-3, all premises wrong): candidate 1's "dead code" claim on `wasm-core/src/number_processor.rs` was false — the explorer had read `src-tauri/CLAUDE.md`'s drift note but never `wasm-core/CLAUDE.md`, which documents the file as a deliberate parity spec a few lines above the drift note it did quote (see ADR-041). Candidate 2's "hand-rolled duplicate, just call the shared function" was false — the two functions diverge in error-propagation shape by necessity (see `src-tauri/CLAUDE.md`'s `Result<DictionaryResponse, String>` entry), not accident; the real bug was a missing collision check, found only by diffing bodies line-by-line. Candidate 3's "shallow-methods design has cost real bugs" causal link was false — the cited bugs live in two methods that aren't even part of the proposed collapse. A report's cited evidence (a doc quote, a "these bugs prove it" link, a "just call X" fix) needs the same re-verification as its facts — and "a CLAUDE.md says X" isn't verified until you've confirmed it's the CLAUDE.md co-located with the actual code, not a sibling one that happened to mention the same file in passing.
- **A candidate's prior decision lives in seven places, and the explorer reads about two** (rounds 5–7, 15, 23, 28 and 30; in round 7, 4 of 6 candidates had one, in round 23 two of four — ADR-024's addendum and `wasm/CLAUDE.md`'s "on purpose" note — and the report shipped both as "no conflict"; in round 28 the explorer cited ADR-083 for candidate #2 but not ADR-083's own addendum, which had declined the same fold, and the round 20 `deleted-symbols.md` entry had skipped it too. Citing an ADR is not reading its addenda; round 30 shipped candidate #4 claiming ADR-009 was stale when its "Current state" section already overrides the old text, and proposed folding `wasmInstanceCheck` that ADR-080's addendum keeps separate): ADR bodies and their _addenda_ (ADR-055's 2026-10-03 addendum already declined routing export through the queue; ADR-060's Consequence forbade moving Rust's rename config edit to TS while the report cited only ADR-031), `deleted-symbols.md` ("do not delete" on `getWasmStatus`/`getMemoryUsage`), scoped `CLAUDE.md` ("do not re-propose unifying the two catch shapes"), `GLOSSARY.md`, code or CSS comments citing `architecture review <date> candidate #N` (the "one class per kind × column" rule sat in a CSS comment), and guard-test header comments (`IpcCommands.parity.test.ts` declined response-shape checks in a comment until ADR-081). Put the two greps below in the explorer's prompt: rounds 15 and 23 didn't, and #7 of 15 was ADR-055's addendum again. Run them yourself before presenting, since the explorer's "no ADR conflict" is only as good as its search. Before presenting a candidate: `grep -rlE '<symbol or file>' docs/adr docs/guides GLOSSARY.md` and `grep -rniE "re-propose|rejected|ruled out|do not delete|architecture review" <the touched files and their CLAUDE.md files>`; read each hit's addenda, Consequence and stated objection. A candidate can answer an objection (a `severity` field did once), but only if you know it exists. Count with `--include='*.ts'`-style filters and `grep -v` for tests, docs and `.d.ts` (27 uses in 14 files was 21 in 9).
- 2026-10-03 architecture review round 6 (commit-subject numbering; the "6th round" line above is an earlier same-day round) — #1, #2, #4 and #6 shrank, #3 and #5 held: facts right, benefit claims wrong. #4's "tests run on a temp dir without the dictionary cache" was already true of the existing inline tests; #1's "two extra retirement paths" ignored the cascade registry and its gate, so the real gap was retry parity; #2's "three copies" was four (a test-local copy in the JS test). Re-derive the _benefit_ the card claims, not just that the code exists. The same goes for the code's own effect: ADR-072/088 ruled on where the cache invalidator lives without asking whether it cleared anything, and round 34 found it inert (tries fixed at load) and deleted it (ADR-106). Measure a cost claim before it rates a card: a `bun` script over the real app data (gotchas.md, ad-hoc scripts) took round 41's #1 from inferred to 3 s per Add, and #2's "1,000 guesses per render" to 11 ms, which declined it.
- **Re-derive an objection the way you re-derive a benefit.** Round 37 first advised against moving Phase 4 onto `findMatchesAtToken` ("it would widen matching") on a hypothesis; one counter over 173,724 real lookups found 0 differing match lists and the advice reversed. A claimed behaviour difference between two lookups is a one-counter measurement (compare their result lists on real windows), so measure it before ruling a candidate out.
- **A card's friction can be real while its remedy is the wrong shape: before designing a module around a field with several writers, remove one writer and run the suite.** Round 40 candidate 1 ("one Sentence Start module" for `startedBy`) became a deletion: removing `fixAngleQuotePositioning`'s `startedBy` rewrite failed only the two tests that asserted the field itself (tests that fail alone pin the implementation, not the behaviour), and 0 capitalization differences over 13.3M chunks of 55 books confirmed it.

**A candidate citing a prior ADR as precedent for deferring/rejecting an idea needs the ADR's actual blocking CONDITION checked, not just its existence.** ADR-033 deferred a pattern-matcher parity test because no trusted oracle existed on either side; a later candidate cited it for a tokenizer parity test where fixture-based oracles already existed on both sides, and the precedent didn't actually transfer (see ADR-033 vs the resolved candidate #6 in GLOSSARY.md's TextTokenizer entry).

**ADRs drift factually even when their decisions hold — confirmed empirically (2026-07-28, full 34-ADR audit).** File paths, processor/caller counts, and described mechanisms in ADR bodies go stale as code refactors (e.g., "three WASM processors" after one was deleted and two others adopted the pattern; a cache-invalidation mechanism fully replaced by a single `destroy()` call). ~1/3 of ADRs needed a correction; 2 needed "Superseded" status. Verify an ADR's factual claims against current code before citing it — same discipline as the `.d.ts`/`GLOSSARY.md` warnings below. **Deleting code an ADR's Consequence section names as a fallback** ("can be wired up later") stales the ADR — add a dated addendum noting the fallback no longer exists, don't leave it silently wrong. Example: `ADR-034` addendum, 2026-08-06 (the trie-level `validateIntegrity`/`repair`/`getHealthScore` methods it left as a future-wiring fallback were themselves deleted 9 days later as confirmed dead code).

**Ambient `.d.ts` types can encode the wrong contract:** `checkJs: false` means nothing validates `src/types/*.d.ts` against real runtime behavior — found drifted to match a _buggy consumer's_ expectation instead of the real producer at least 3 times (a dead getter's return type; a status-string enum matching a hook's wrong check instead of what the method actually returns; `ThrottledStreamingState` under-declaring 2 real runtime fields). Verify a `.d.ts` claim against the real implementation before trusting it, especially before fixing a consumer to match the type instead of the other way around. Before diagnosing a `.d.ts`-surfaced type error as a live runtime bug, trace the actual data flow (e.g. a passthrough hook) — the type may just be incomplete, not the data. Related: **`tsc --noEmit` does NOT catch broken internal `.d.ts` references** — `skipLibCheck: true` silently suppresses type errors _inside_ any `.d.ts` file, including a completely undefined identifier. When pruning declarations from a `.d.ts` file, manually trace which "orphaned" declarations are actually referenced by declarations you're keeping (same-file, no import needed) — `tsc` will not warn you. Watch for `export type {...} from '<path>'` barrel re-exports too — a reference style plain import-statement regexes miss because it starts with `export`, not `import`.

**In-code JSDoc "EXECUTION PATH"/"Called from" comment blocks drift from real callers too — same family as `.d.ts`/ADR drift above.** Found 2026-08-17: `ChunkPostProcessor.js`'s `reconstructText`/`reconstructTextWithSegments` doc comments both claimed a char-only-mode/full-translation-mode split; grepped real callers and found both are full-translation-only, split instead by progressive-batch-fast-path vs single-pass-needs-segments-inline. Grep real callers before trusting a method's own claimed "Used by"/"Called from" doc lines, especially before using them to justify a design decision.

**`GLOSSARY.md` glossary entries have no tooling verifying them against real code** — same drift risk as the `.d.ts` warning above. Found 3 stale entries in one pass (2 pre-existing): `SystemPerformanceMonitor` still said "four integration adapters" after `ContentAwarePositionCache` was deleted (3 remain); `PerformanceHealth` still documented a `cacheHitRate` param removed earlier than that. Verify an entry against the real module before trusting it, especially one describing code you're about to touch. **After deleting or moving a module, grep its name and its public methods over `src docs GLOSSARY.md`, not just `src`:** code comments, glossary entries, ADR bodies, the ADR index and `Window` typings in `ElectronTypes.d.ts` fail no check, so the grep is the only gate (2026-10-03: a deleted scroll-buffer module stayed in `GLOSSARY.md` as "keeps a fallback" until the next slice's grep). Prose that describes the behavior without the symbol survives that grep, so grep the concept's words too (2026-10-24: after deleting the lookup memo, `GLOSSARY.md` still said "the Lookup memo's LRU size" bounds memory; after dropping a call, it still said matching "precedes the capitalization update"). **Deleting a `GLOSSARY.md`/`CLAUDE.md` glossary-style entry:** read the full entry through to the next `##` heading before building the `Edit` `old_string` — a partial-window `Read` can miss a trailing paragraph, and a partial-match delete leaves it orphaned with no error, only a follow-up grep catches it.

**A scoped `CLAUDE.md`'s own "deliberate keep" rationale can itself be stale** — confirmed 2026-08-25: `wasm-core/CLAUDE.md` documented `number_processor.rs` as intentionally "kept as the spec/test suite for JS `NumberProcessor.js` (155 tests validate parity)," but the real count was 35, the suite was never wired into CI, and one existing test discarded its result instead of asserting on it (`let _ = ...`). The retention rationale itself was correct; the specific claims backing it were not. Verify counts/enforcement claims in any "why we kept this" note before citing it, same as the ADR/`.d.ts`/`GLOSSARY.md` entries above. Same drift 2026-10-24: "27-char" (the list has 26), `src/utils/CLAUDE.md`'s "`translate()` is prefix-match" (a test pinned it exact), `PersistTimeValidator`'s "moves pass through `checkEntry`" (`planMove` validates nothing), `lib.rs`'s "155 tests" (46). Write such a claim without the number, and probe an "X is enforced on Y" claim at Y.

**Common method names collide across unrelated classes** (`getCacheStats`, `getPerformanceReport`, `clearAll`, etc.) — when grepping to confirm "zero callers," verify each hit actually belongs to the class in question, not a same-named sibling. Caught twice in one session (2026-08-06): `TranslationEngine.getPerformanceReport()` vs `WasmDictionaryManager.getPerformanceReport()` (since deleted); `DebugObjectPool.getCacheStats()` vs `DictionaryManager.getCacheStats()`. Caught twice more 2026-08-16: `generateOptimizationRecommendations` (`AdaptiveChunker` vs `WasmMemoryPoolManager`, both since deleted) and `getConfig` (`UnicodePunctuationDetector` vs `ParallelConfig`, all since deleted).

**Verifying "was this WASM/optimization feature ever benchmarked":** grep the whole git history for the baseline-key string it writes (`git log --all -S "<key>"`), and read the ORIGINAL creation commit's own message. This repo's WASM experiments have baked a "Performance Target" projection into a doc comment worded as if it were a measured "Benchmark:" result at least once (`WasmRegexUtils.js`, confirmed 2026-07-18) — a commit's own "Next Steps: run benchmarks to verify" is a stronger signal than any doc-comment claim.

**A failing pre-existing test can mean the fix is working, not that it broke something** — when deliberately tightening a validation/classification rule, some tests may have locked in the old (now-intentionally-wrong) behavior as their expected value. Confirmed 3 times in one session (2026-09-07): `PatternTemplateEngine.test.js`'s `Xabc → ['X']` case, `PersistTimeValidator.test.ts`'s `'X' + 'a'.repeat(...)` length fixture, and `DictionaryTrieBuilder.test.ts`'s `frequency: 1` assertion all encoded behavior the fix correctly changed. Read what the fixture actually asserts before reverting the fix or patching around the failure.

**Dead-code cleanup with fallow has multiple blind spots** (dynamic imports, CSS `composes`, class vs singleton, test-only). See [Fallow Protocol](./development.md#fallow-dead-code-analysis) before deleting anything.

**A CI failure on your own push isn't necessarily caused by your push.** `gh run list` then `gh run view <run-id> --log-failed` before assuming a red check traces to the diff just pushed — confirmed 2026-09-19: `src-tauri`'s `book_loader`/`chapter_outline` corpus tests (`src-tauri/CLAUDE.md`'s Reader Corpus Tests entry) had failed on every run since 2026-09-13, unrelated to the Reader UI work under review; `ci.yml` never set the tests' own documented `SKIP_READER_CORPUS_TESTS` opt-out.

## Related Guides

- [Architecture Guide](./architecture.md) - Execution paths, semantic arrays, token contracts
- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Performance Guide](./performance.md) - Performance monitoring and optimization

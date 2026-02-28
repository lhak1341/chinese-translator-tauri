# Patterns Semantic Type Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Semantic Type filter row (PER / PLA / CON / OBJ + No Type) to the Structural Patterns dictionary filter panel, matching what Common Phrases and Proper Nouns already have.

**Architecture:** Single-line change in `EnhancedVirtualizedDictionaryTable.tsx`. The flag `showSemanticTypeFilter` controls whether the Type filter row renders; extending it to include `isPatternsDictionary` is sufficient. Filter application logic and filter UI already work generically.

**Tech Stack:** React/TypeScript, `EnhancedVirtualizedDictionaryTable.tsx`

---

## Background for the Implementer

### Current flag (line ~1915)

```ts
const showSemanticTypeFilter = isPhrasesDictionary || isProperNounsDictionary;
```

### Target

```ts
const showSemanticTypeFilter =
  isPhrasesDictionary || isProperNounsDictionary || isPatternsDictionary;
```

### Why nothing else changes

- **Filter application** (lines 1322–1331): already reads `translation.semanticType` for all dictionaries — no change needed.
- **Filter UI** (lines 2276–2333): already inside `{showSemanticTypeFilter && ...}` — renders automatically.
- **"No Type" behaviour**: matches patterns with no `semanticType` set — consistent with how Phrases works.

### Running checks

```bash
# TypeScript check:
npm run type-check

# Full test suite:
npm test -- --run
```

---

## Task 1: Enable Semantic Type filter for Structural Patterns

**Files:**

- Modify: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` (~line 1915)

There are no unit tests to write for a one-line flag change. Use `type-check` as the correctness gate.

### Step 1: Verify baseline

```bash
npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

### Step 2: Make the change

Find this line (around line 1915):

```ts
const showSemanticTypeFilter = isPhrasesDictionary || isProperNounsDictionary;
```

Change it to:

```ts
const showSemanticTypeFilter =
  isPhrasesDictionary || isProperNounsDictionary || isPatternsDictionary;
```

### Step 3: Run type-check

```bash
npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

### Step 4: Run full test suite

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: 1170+ passed, 0 failures.

### Step 5: Manual smoke test

Start the app (`npm run tauri:dev`), open the Dictionary tab, select Structural Patterns. Open the filter panel. Verify:

- A "Type:" row now appears with PER / PLA / CON / OBJ buttons and a "No Type" button
- Clicking PER filters to patterns whose `semanticType = 'person'` (these are `allowAsPatternVariable: true` patterns with that type set)
- "No Type" shows patterns with no `semanticType` set
- Multiple type buttons can be active simultaneously
- Switching to Common Phrases or Proper Nouns — their Type filter still works
- The Pattern and Flags rows on the Patterns filter are still present and unchanged

### Step 6: Commit

```bash
git add src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx
git commit -m "feat(ui): add Semantic Type filter to Structural Patterns dictionary"
```

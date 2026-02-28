# Patterns Semantic Column Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Semantic" column (12%) to the Structural Patterns dictionary table, showing the output semantic type for rows where `allowAsPatternVariable` is true, mirroring how the phrases table already works.

**Architecture:** Single-file change in `EnhancedVirtualizedDictionaryTable.tsx`. The `SemanticTypeToggleCell` component already exists and is used by the phrases block — reuse it unchanged. Three edits: (1) column header, (2) translation cell width, (3) row cell.

**Tech Stack:** React/TypeScript, `EnhancedVirtualizedDictionaryTable.tsx`

---

## Background for the Implementer

### How the patterns table currently looks (column widths)

```
checkbox(40px) | source(calc(25%-20px)) | translation(55%) | X types(10%) | Y types(10%)
```

### Target layout after this change

```
checkbox(40px) | source(calc(25%-20px)) | translation(43%) | Semantic(12%) | X types(10%) | Y types(10%)
```

### Key locations in `EnhancedVirtualizedDictionaryTable.tsx`

| What                                                                                  | Lines      |
| ------------------------------------------------------------------------------------- | ---------- |
| `SemanticTypeToggleCell` component definition                                         | 456–501    |
| Patterns **header** block (the `selectedDictionary === 'patterns'` header `<>...</>`) | ~2458–2525 |
| Patterns **row** block — translation `<div style={{ width: '55%' }}>`                 | ~750       |
| Patterns **row** block — X/Y `TypeToggleCell` components                              | ~788–802   |
| Phrases row — `SemanticTypeToggleCell` usage (template to copy)                       | ~906–915   |

### The phrases `SemanticTypeToggleCell` cell to copy (lines 906–915)

```tsx
{
  /* Semantic type - 12% (only shown when entry is allowed as pattern variable) */
}
{
  allowAsPatternVariable ? (
    <SemanticTypeToggleCell
      activeType={semanticType}
      onSelect={handleSetSemanticType}
      width="12%"
    />
  ) : (
    <div style={{ width: '12%', minWidth: '12%' }} />
  );
}
```

### What `semanticType` and `handleSetSemanticType` are

Before making the row cell edit, check if `semanticType` is already destructured from `entry.metadata` in the patterns row block. If not, add:

```tsx
const semanticType = entry.metadata?.semanticType ?? '';
```

For `handleSetSemanticType`, check if it's already defined in the patterns row scope. If not, look at how `handleToggleVariableType` is defined in the same scope and define a similar handler:

```tsx
const handleSetSemanticType = (type: string) => {
  onUpdateEntry(entry.id, {
    ...entry,
    metadata: { ...entry.metadata, semanticType: type || undefined },
  });
};
```

If a handler with the same logic already exists in the patterns block under a different name, use that instead.

### Running tests

```bash
# TypeScript check (after every edit):
npm run type-check

# Full JS suite (after all edits):
npm test -- --run
```

---

## Task 1: Add Semantic column to Patterns dictionary table

**Files:**

- Modify: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`

There are no unit tests to write for a purely visual column addition. Use `type-check` as the correctness gate.

### Step 1: Verify baseline

```bash
npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

### Step 2: Edit 1 — Add "Semantic" header between Translation and X types

Find the patterns header block (`selectedDictionary === 'patterns'` header section, ~line 2490–2505). It has a `<div>` for "Translation" (`width: '55%'`) followed by a `<div>` for "X types" (`width: '10%'`).

Change the Translation header width from `'55%'` to `'43%'` and insert a new Semantic header div immediately after it, before the X types div:

```tsx
<div
  style={{
    width: '43%',           // was '55%'
    padding: '0.5rem 0.75rem',
    fontWeight: 'bold',
  }}
  title="Translation with metadata badges (VAR = Allow as variable, LP = Low priority)"
>
  Translation
</div>
<div
  style={{
    width: '12%',
    padding: '0.5rem 0.25rem',
    fontWeight: 'bold',
    fontSize: '0.75rem',
    textAlign: 'center',
  }}
  title="Output semantic type (shown when pattern can be used as a variable)"
>
  Semantic
</div>
{/* X types div follows unchanged */}
```

### Step 3: Run type-check after Edit 1

```bash
npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

### Step 4: Edit 2 — Change translation row cell width from 55% to 43%

Find the patterns row translation cell (~line 750):

```tsx
<div className={styles.cellEditable} style={{ width: '55%' }}>
```

Change to:

```tsx
<div className={styles.cellEditable} style={{ width: '43%' }}>
```

### Step 5: Edit 3 — Add Semantic row cell between translation and X types cells

Find where the patterns row's `TypeToggleCell` for X begins (~line 788). Insert the Semantic cell immediately before it.

First check what variables are in scope in this patterns row block:

- `allowAsPatternVariable` — already used by MetadataBadge, so it's in scope
- `semanticType` — may or may not be extracted yet; add it if absent
- `handleSetSemanticType` — likely not defined; add it

Add these near the top of the patterns row rendering block (alongside where `allowAsPatternVariable` and `lowPriority` are extracted from `entry.metadata`):

```tsx
const semanticType = entry.metadata?.semanticType ?? '';

const handleSetSemanticType = (type: string) => {
  onUpdateEntry(entry.id, {
    ...entry,
    metadata: { ...entry.metadata, semanticType: type || undefined },
  });
};
```

Then insert the Semantic cell immediately before the first `TypeToggleCell`:

```tsx
{
  /* Semantic type - 12% (only shown when pattern can be used as a variable) */
}
{
  allowAsPatternVariable ? (
    <SemanticTypeToggleCell
      activeType={semanticType}
      onSelect={handleSetSemanticType}
      width="12%"
    />
  ) : (
    <div style={{ width: '12%', minWidth: '12%' }} />
  );
}
```

### Step 6: Run type-check after all edits

```bash
npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

### Step 7: Run full test suite

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: 1170+ passed, 0 failures.

### Step 8: Manual smoke test

Start the app (`npm run tauri:dev`), open the Dictionary tab, select the Structural Patterns dictionary. Verify:

- "Semantic" column header appears between "Translation" and "X types"
- For a pattern with `allowAsPatternVariable: true`, the Semantic cell shows PER/PLA/CON/OBJ chips; clicking one selects it and saves
- For a pattern without `allowAsPatternVariable`, the Semantic cell shows a blank placeholder (no chips)
- Translation column is visibly slightly narrower but still readable
- X types and Y types columns are unchanged

### Step 9: Commit

```bash
git add src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx
git commit -m "feat(ui): add Semantic column to Structural Patterns dictionary table"
```

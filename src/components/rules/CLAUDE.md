# src/components/rules — Gotchas

## Two UI Surfaces, One Set of Field Policies

`NewRuleModal` (create) and `RuleRow` (inline table edit) are two separate UI surfaces for
the same `TransformRule` fields. Any new field-level policy — validation, a derived
default, mode-aware rendering — must be wired into BOTH, not just one, or the two forms
silently diverge. Shared policy lives in `src/utils/dictionary/TransformRuleValidation.ts`
(raw field parse/reject: `parseValidatedNumber`, `parseValidatedKey`, `isValidMatchKind`,
`isValidSemanticType` — moved here 2026-09-08 architecture review candidate #1 grilling,
so the load-time validator in the same file, `validateTransformRule`, enforces the
identical key/number/enum contract instead of redefining it) or `TransformRuleEngine.ts`
(derived-default/domain policy: `compareRulePrecedence`, `applyRule`,
`deriveCapitalizeExceptNForKeyEdit`) — never hand-roll the same check/derivation inline in
just one component. `RuleFieldValidation.ts` (this directory) now holds only
`extractHanChars`, a UI-only clipboard-prefill helper with no load-time counterpart.

**The derivation-skipped-on-one-path bug class is guarded by the shared functions above**
(confirmed real: `key`'s `capitalizeExceptN` derivation was missing from one of the 3 call
sites until 2026-08-14). All 3 call sites (`RuleRow.tsx`, `RulesManager.tsx`, and
`NewRuleModal.tsx`'s `handleKeyChange`) are now behaviorally test-proven — the third was the
last gap, closed 2026-08-24 (architecture review candidate #1 grilling). What's NOT guarded is a brand-new field's JSX simply never being
added to one of the two files — a presence gap, not a policy gap. `__tests__/
RuleFieldParity.test.tsx` catches that: it asserts every `TransformRule` field renders
some queryable control in both `NewRuleModal` and `RuleRow`, and its own second test
(`every TransformRule field has a parity entry above`) fails loudly if a new field is
added to the type but never added to the test's own field list. Add a new field's locator
pair there when you add the field to the two components — a full schema-driven
dual-renderer was considered and rejected (Grill #4, 2026-08-15): the two surfaces'
widgets are legitimately different per field (a form checkbox vs. a compact table-cell
toggle chip, see below) and unifying rendering would trade locality for no real leverage
gain at this fixed 2-surface, 9-field scope.

**`NewRuleModal`'s visible text and its accessible names deliberately differ** (A2 redesign,
2026-09-26). It shows plain wording — "Move to front", "Lowercase last N", "Only at N
characters", "Ends with / Starts with" — but each control keeps the old field-label name
("Relocate to opposite end", "Capitalize except N", "Total-length limit (optional)", "Match"),
because `RuleFieldParity.test.tsx` and `RulesManager.test.tsx` find each field by that name in
both surfaces. Rename a control's `aria-label` only together with those locators. Its preview
(`findRuleMatchingEntries` + `applyRule` over `joinCharGloss`) shows the Add form's _guess_ for
each matching source, not a rewrite of the saved entry — rules never touch saved entries.

## `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24

Was `moveWords: number` (values only ever `{0,1}` since 2026-08-15, but the type stayed
`number` — see CONTEXT.md's "Transform Rule" entry). Renamed to `relocate: boolean` so the
type itself enforces the domain instead of prose alone (architecture review candidate #2
grilling). `TransformRuleBackend.loadTransformRules` migrates a pre-2026-08-24 persisted
`moveWords` key to `relocate` on load — production `transform-rules.json` never needed the
adapter (all 230 rules already `{0,1}`), it's defensive against hand-edited or exported
files. Do not reintroduce `moveWords` at a new call site; the field's canonical name and
type are `relocate: boolean` everywhere in memory. `transform-rules.json`'s Rust side is a
bare `serde_json::Value` pass-through — no typed Rust struct exists for `TransformRule`. Any
future field change (add/rename/retype) is TS-only, zero Rust changes needed.

## Compact Toggle-in-a-Table-Cell Pattern

A `<select>` crops in a narrow table cell, so a 2-state field renders as a pair of small
chip buttons instead. `MatchKindToggle` and `MoveModeToggle` were two near-byte-identical
files hand-rolling this shape independently — unified 2026-09-09 (architecture review
candidate #1 grilling) into `BinaryToggleChips<T>` (`src/components/dictionary/
TableBuildingBlocks.tsx`), built on the same `BadgeChip` primitive `SemanticTypeToggleCell`/
`TypeToggleCell` use. A third narrow-cell 2-state field should call `BinaryToggleChips` with
its own `options` array — do NOT create a new `XyzToggle.tsx` file that re-derives the chip
styling; that's the exact duplication this unification closed. `RuleRow.tsx`'s `matchKind`/
`relocate` cells are the reference call sites.

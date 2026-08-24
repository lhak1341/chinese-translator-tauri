# src/components/rules — Gotchas

## Two UI Surfaces, One Set of Field Policies

`NewRuleModal` (create) and `RuleRow` (inline table edit) are two separate UI surfaces for
the same `TransformRule` fields. Any new field-level policy — validation, a derived
default, mode-aware rendering — must be wired into BOTH, not just one, or the two forms
silently diverge. Shared policy lives in `RuleFieldValidation.ts` (raw input parse/reject:
`parseValidatedNumber`, `parseValidatedKey`, `extractHanChars`) or `TransformRuleEngine.ts`
(derived-default/domain policy: `compareRulePrecedence`, `applyRule`,
`deriveCapitalizeExceptNForKeyEdit`) — never hand-roll the same check/derivation inline in
just one component.

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

`MatchKindToggle` and `MoveModeToggle` are two instances of the same shape: a `<select>`
crops in a narrow table cell, so a 2-state field renders as two small chip buttons instead
(reusing `dictStyles.metadataBadge`). A third narrow-cell 2-state field should follow this
pattern, not introduce a `<select>` or a bare checkbox that doesn't fit the table's density.

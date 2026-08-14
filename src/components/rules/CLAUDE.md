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

## Compact Toggle-in-a-Table-Cell Pattern

`MatchKindToggle` and `MoveModeToggle` are two instances of the same shape: a `<select>`
crops in a narrow table cell, so a 2-state field renders as two small chip buttons instead
(reusing `dictStyles.metadataBadge`). A third narrow-cell 2-state field should follow this
pattern, not introduce a `<select>` or a bare checkbox that doesn't fit the table's density.

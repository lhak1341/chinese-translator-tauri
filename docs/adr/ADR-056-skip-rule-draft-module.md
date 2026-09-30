# ADR-056: Skip a Rule-Draft Module

**Status:** Decided
**Date:** 2026-09-30

## Context

The architecture review of 2026-09-30 (candidate #4) proposed one module owning "a new Transform Rule being drafted": opening it (empty or prefilled), editing a field with its derived defaults, the conflict check, the preview criteria and Save. The evidence was that `RulesManager.tsx` holds `EMPTY_DRAFT`, the prefill and the Save gate; `NewRuleModal.tsx` derives the key's default again, computes the preview gates and trims the key a second time; `NewRuleModal` takes `draft` plus `setDraft` and edits it through 14 inline `setDraft({...draft, …})` calls; and `RuleFieldValidation.ts` redefined the `HAN_CHAR` regex.

Reading the code in the grilling showed most of this was already one module. The 2026-09-28 review (candidate #5) put what an edited value means in `TransformRuleValidation.ts` (`commitRuleField`, `commitRuleDraft`, `ruleDraftProblem`), and the key's capitalize default is one function, `deriveCapitalizeExceptNForKeyEdit`, which both call sites call rather than copy.

## Decision

Do not build a rule-draft module. Fix the two real duplicates instead:

- `extractHanChars` moves into `TransformRuleValidation.ts` and uses its `HAN_CHAR`, so a prefilled key is always one `parseValidatedKey` accepts. `RuleFieldValidation.ts` is deleted.
- `draftAsRule(draft)` is the one trimmed view of a draft, read by both the conflict check (`RulesManager`) and the preview (`NewRuleModal`), with one draft id (`DRAFT_RULE_ID`).

## Reasoning

**The deletion test fails for the proposed module.** Every rule a draft obeys already has one owner. The module would take in `EMPTY_DRAFT`, the prefill and two trims, and hand the modal a wider interface than `draft`/`setDraft` in exchange. Complexity would move, not concentrate.

**Raw setters are the right interface for a form.** ADR-025 and ADR-039 reached this for `useDictionaryEntryForm`: a form edits fields, and named actions per field add a layer each caller must learn without removing a decision. The rules form is the same shape.

## Consequence

A future review should not re-propose a rule-draft module from the `setDraft` count or the split between `RulesManager` and `NewRuleModal`. Revisit only if a rule appears that a draft must obey and that `TransformRuleValidation.ts` cannot own — a derivation needing state outside the draft, say — or if a third surface starts creating rules.

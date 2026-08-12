# ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output"

**Status:** Decided
**Date:** 2026-08-12

## Context

An architecture review round (candidate #3) flagged `src/components/rules/RuleMatchesModal.tsx` as a shallow module: the modal's job is "preview what a Transform Rule would do," but `findRuleMatchingEntries` (`TransformRuleEngine.ts`) only surfaces existing dictionary entries whose Source matches the rule's suffix/prefix + key + charCount criteria — it never calls `applyRule`. The card's framing: the interface promises a transform-output preview, the implementation delivers an existing-entry filter, and the fix is to run `applyRule` per matched entry and render original vs. simulated output.

Grilling this candidate required re-reading `RuleMatchesModal.tsx` in full first. That surfaced three facts the original card didn't have:

- The modal's own doc comment (`RuleMatchesModal.tsx:151-155`) already describes it as showing "every dictionary entry a Transform Rule matches... Translation/VAR/Semantic are live-editable, wired to the same `updateEntry` the Dictionary tab itself uses." This is not a passive preview — the Translation cell is a real inline editor (`useInlineFieldEdit`) that calls `updateEntry` and mutates the dictionary on commit.
- Its sole caller is `RulesManager.tsx`'s per-rule "View matching entries" button (confirmed via full-repo grep — no other caller exists).
- CONTEXT.md's "Transform Rule" glossary entry (the canonical spec for this feature, added 2026-08-08) documents matching precedence, application order, `moveReplacement` semantics, and the Rules tab's authoring UI in detail — but has no statement anywhere that `RuleMatchesModal` is meant to simulate a rule's transform output for existing entries.

Given all three, the modal reads as a genuine **audit-and-bulk-edit tool**: browse every entry a rule's matching criteria would apply to, and fix up Translation/VAR/Semantic directly if any of them are wrong or stale (e.g. entries translated by hand before the rule existed). "Preview" in its name means "preview the _set of matched entries_," not "preview the transform output" — the live-edit wiring is deliberate, not an oversight.

## Decision

Do not build the applyRule-simulation fix. The modal's current behavior — showing and letting the user edit the real stored translation for each matched entry — is correct for what the modal actually is.

Also rejected, on the same investigation, as unnecessary scope: adding a non-editable "Suggested: X" column that runs `applyRule` alongside the real value, to let a user spot drift between a rule's current output and an entry's actual (possibly hand-edited or legacy) translation. No reported case of this drift causing confusion exists; CLAUDE.md's own architecture-review guidance is explicit about not designing for hypothetical future requirements.

## Reasoning

**The "misleading interface" premise doesn't hold up against the module's own contract.** A module's interface is only shallow/misleading if its documented and actually-wired behavior diverges from its real job — here the doc comment, the sole call site, and the live `updateEntry` wiring all agree with each other and with "audit + edit existing entries." The only thing that disagreed was the architecture review card's own assumption about what "preview" must mean, formed without reading the component's full implementation first.

**Deletion test doesn't apply the way the card assumed.** The card treated `findRuleMatchingEntries` not calling `applyRule` as the shallow gap to fill. But deleting the live-edit wiring (to make room for a pure simulation) would remove the feature's actual value — bulk-fixing stale translations across every matched entry for a rule — and replace it with a strictly narrower read-only view. That's not deepening a shallow module; it's cutting a deep one down to match a wrong assumption about its interface.

## Consequence

Future architecture reviews should not re-propose an `applyRule`-based transform-output preview for `RuleMatchesModal` without new evidence — e.g. a real user report of confusion between a rule's current behavior and what's shown for existing matches, or a concrete request for the "Suggested" drift-detection column described above. Absent that, the modal's job stays "browse and bulk-edit the entries a rule's criteria applies to," not "simulate the rule."

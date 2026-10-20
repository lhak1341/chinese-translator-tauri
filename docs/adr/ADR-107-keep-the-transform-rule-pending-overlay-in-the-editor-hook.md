# ADR-107: Keep the Transform Rule Pending Overlay in the Editor Hook

**Status:** Decided
**Date:** 2026-10-20

## Context

An architecture review (2026-10-20, round 34, candidate #5) proposed moving the Transform Rule pending overlay out of `useTransformRuleEditor` (`src/hooks/useTransformRules.ts`) into `TransformRuleBackend`. The overlay is what lets an edit show at once: the editor renders the saved rules with every change still waiting to save applied on top (`withPending`), tracks those changes in `pendingRef`, and tells a conflict found at a change's turn from a failed save, to choose the toast. The argument was the rule in `src/components/CLAUDE.md`: state whose correctness is ordering across async work lives in a plain module with `subscribe`/`getSnapshot`, and the hook is an adapter. Today the overlay's ordering is reachable only through `renderHook`.

The placement was chosen on 2026-09-29 (commit `67d433f`), when the save queue moved into the backend as `commitRuleChange` and the overlay stayed in the editor. No written decline recorded it, which is why it came up again.

## Decision

Keep the overlay in `useTransformRuleEditor`. The backend keeps only the queue and the saved rules.

## Reasoning

- **The ordering that matters is already a plain module.** `commitRuleChange` runs changes one at a time against the last good save, drops a failed or conflicting change alone, and has its own module tests in `TransformRuleBackend.test.ts`. What the overlay adds is a view of that queue for one screen.
- **Moving it would leak unsaved rules or add a second snapshot.** The Add form reads the saved rules through the read-only `useTransformRules()`, and must not seed from a change that may still fail. With the overlay in the backend, either its snapshot carries pending changes to the Add form, or the backend grows a second, pending-aware snapshot for `RulesManager` alone. Either way the complexity moves into the backend; the deletion test does not favor it.
- **It is tested through the real backend, and no bug has come from it.** `useTransformRules.test.ts` runs the editor over the real backend with only the IPC stubbed, including the two in-flight ordering cases. A probe during the review looked for the one failure the split could cause: a save landing (the cache updates and `saved` re-renders) before the editor drops the pending change, so a toggle would apply twice and show as reverted for a frame. It rendered `true false`, inside and outside `act`, with no reverted frame.

## Consequences

- Future reviews should not re-propose moving the overlay into the backend on the "plain module, hook as adapter" rule alone. A real reason would be a second screen that needs pending changes, or a bug in the overlay's ordering.
- The editor's immediate conflict check now reads the backend's cache (`getTransformRulesSnapshot()`) instead of a ref copy of the rendered `saved` rules, so the hook holds no copy of the saved rules, as `src/components/rules/CLAUDE.md` already required.

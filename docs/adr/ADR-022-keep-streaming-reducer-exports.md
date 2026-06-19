# ADR-022: Keep streamingReducer and Initial State Constants Exported

**Status:** Decided  
**Date:** 2026-06-20

## Context

`useStreamingTranslation.js` exports 4 symbols:

- `INITIAL_STREAMING` — zero-value for the streaming translation sub-state
- `INITIAL_STATE` — zero-value for the full reducer state (wraps `INITIAL_STREAMING`)
- `streamingReducer` — pure reducer: 4 cases (`UPDATE_STREAMING`, `SET_PROGRESS_INFO`, `SET_PARTIAL_ARRAYS`, `RESET`)
- `useStreamingTranslation` — the hook (sole production caller: `Translator.jsx`)

The 2026-06-20 architecture review proposed sealing the reducer and initial state constants (removing their `export`), and migrating the 8 pure reducer tests to `renderHook` style to drive state through the hook's public setters instead of dispatching action objects directly.

The exports were introduced intentionally in commit `3a50491` (2026-06-07) alongside the `3 useState → useReducer` migration, specifically to enable pure reducer tests.

## Decision

Keep `streamingReducer`, `INITIAL_STATE`, and `INITIAL_STREAMING` exported. Do not migrate the reducer test suite to `renderHook`.

## Reason

**The reducer is genuinely testable at its own level.** `streamingReducer` is pure — no closure over external state, no `this`, no side effects. Pure functions earn direct testing; hiding them behind a React hook boundary adds noise without adding coverage.

**The pure tests are faster and more diagnostic.** The hook includes a `useThrottledValue` with a 100ms delay. Reducer tests that verify field-isolation (e.g. `UPDATE_STREAMING` leaves `progressInfo` unchanged) run without fake timers, without `act()`, without `renderHook`. Migrating these to hook tests would add `vi.useFakeTimers()` + `vi.advanceTimersByTime(150)` to assertions that have nothing to do with throttling.

**No historical friction from the exports.** Action types and state shape have been stable since the reducer was introduced (2026-06-07). No commit shows an action-type rename cascading into test churn.

**The deletion test shows the reducer earns its exports.** The 4 action type cases correspond 1:1 to the 4 public setters; there is no hidden vocabulary. A future developer adding a 5th action type would correctly reach for a reducer unit test, not a `renderHook` test.

**ADR-016** already declined a `StreamingContext` wrapper for this same hook on the grounds that "friction was naming not depth." The same principle applies: the 3 extra exports are not exposing unsafe bypass paths — they are exposing a pure function that the test suite legitimately wants.

## Boundary Condition

If action types diverge from the public setter vocabulary — e.g. one setter dispatches two actions, or actions acquire conditional payload shapes not reflected in the setter signature — then the reducer tests start coupling to internal choreography rather than behavior. Revisit at that point.

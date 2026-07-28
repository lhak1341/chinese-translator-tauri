# ADR-011: Skip useTranslatorSession Coordinator Hook

**Status**: Accepted
**Date**: 2026-05-22
**Decision Makers**: Development Team
**Affected Components**: `src/components/Translator.jsx`, `src/hooks/`

## Update (2026-07-28)

`Translator.jsx` is now ~1069 lines — less than half the 2.4K LOC cited below — via many small, targeted hook extractions (`useClipboardTranslation`, `useCharacterOnlyBridge`, `useAutoTranslateTrigger`, `useForceReload`, `useEngineReinitializer`, `useReloadRetranslate`, and others documented in CLAUDE.md's deleted-symbols log) rather than the one big `useTranslatorSession` coordinator this ADR rejected. This is the _opposite_ of the ADR's own "When to Revisit" trigger ("component grows significantly beyond 2.4K LOC") — it shrank instead, arguably validating the rejection: incremental small-hook extraction outperformed the proposed single wide coordinator. Decision unchanged; the LOC snapshot below is just stale.

## Context and Problem Statement

`Translator.jsx` (2.4K LOC) wires 13 hooks. The coordination contract between them — engine lifecycle, translation controller, streaming state, modal state — lives implicitly in the component body. A `useTranslatorSession` hook was proposed to extract this coordination, making `Translator.jsx` a pure rendering layer and the coordination testable via `renderHook()`.

## Decision Drivers

- **Wide interface**: `useTranslatorSession` would expose ~30 return values (all translation output state + callbacks). Complexity moves rather than reduces.
- **No real coordination bugs**: The wiring between engine lifecycle, streaming, and clipboard has not produced recurring bugs. The friction is theoretical.
- **Testing gain is marginal**: The coordinator hook still calls `useState`, `useRef`, React effects internally. Testing it still requires `renderHook()` with the same mocks for all inner hooks. The gain over rendering the full component is small.

## Alternatives Considered

### Alternative 1: Extract useTranslatorSession ✗ Rejected

Hook owns all translation output state (`inputText`, `translatedText`, `semanticArrays`, etc.) plus `translateText` and coordination effects. Component becomes a thin render shell.

Rejected: ~30-value return interface, no real coordination bugs to fix, complexity moves but does not reduce.

### Alternative 2: Keep coordination in Translator.jsx ✅ Selected

Status quo. `Translator.jsx` remains the single owner of wiring. Can revisit if coordination bugs become a real recurring pain point.

## Decision

Do not extract `useTranslatorSession`. Coordination logic stays in `Translator.jsx`.

## Consequences

### Positive

- ✅ No large refactor of a working 2.4K LOC component
- ✅ No wide (~30-value) hook interface to maintain

### Negative

- ❌ Coordination behavior (clipboard/reload/streaming races) not independently testable

### When to Revisit

- A recurring class of coordination bugs emerges that can only be reproduced by rendering the full component
- The component grows significantly beyond 2.4K LOC due to new coordination concerns

## References

- Component: `src/components/Translator.jsx`
- Existing extracted hooks: `useTranslatorEngine`, `useTranslationController`, `useStreamingTranslation`, `useDictionaryModals`

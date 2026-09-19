import type React from 'react';
import type { TranslationEngine } from '../../types/TranslationEngineTypes';

/**
 * Not exported: the only way to produce a value carrying this brand is `callOnEngine`
 * below, since a plain object literal can't spell a `unique symbol` key it never saw.
 */
declare const ENGINE_CALL_BRAND: unique symbol;

/**
 * A `(text: string) => Promise<T>` proven to route through the Reader's shared engine
 * queue — constructible only by `callOnEngine`.
 *
 * `useWindowedTranslation`/`useOutlineTranslations` type their engine-call options as this
 * rather than a plain function type, so a future Reader hook reaching `engineRef` directly
 * instead of going through `runOnEngine` is a compile error: a plain arrow function is
 * structurally missing the brand and needs an explicit `as EngineCall<T>` to type-check,
 * which is the reviewable red flag a silent bypass used to skip (see
 * `src/utils/reader/CLAUDE.md`'s serialization note). `fillPlan`
 * (`WindowedTranslationFill.ts`) deliberately does NOT require this brand on its own
 * `FillEngineCalls` — it never touches `engineRef` or knows the queue exists, so a fake
 * engine in its tests stays a plain function, no cast needed. Branding is enforced only at
 * the one seam that actually carries the invariant: where `BookReader.tsx` wires a
 * production callback into a hook's options.
 */
export type EngineCall<T> = ((text: string) => Promise<T>) & {
  readonly [ENGINE_CALL_BRAND]: true;
};

/** `BookReader.tsx`'s `runOnEngine` — serializes every call onto one promise chain. */
export type RunOnEngine = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Build one serialized, ready-checked engine call.
 *
 * `work` receives the live, ready engine and the input text, and does only its own engine
 * method call plus result mapping — the "read `engineRef.current`, throw if not ready"
 * check is identical across every caller and lives here once instead of three times.
 */
export function callOnEngine<T>(
  engineRef: React.MutableRefObject<TranslationEngine | null>,
  runOnEngine: RunOnEngine,
  work: (engine: TranslationEngine, text: string) => Promise<T>
): EngineCall<T> {
  const call = (text: string): Promise<T> =>
    runOnEngine(() => {
      const engine = engineRef.current;
      if (!engine?.isReady()) throw new Error('Translation engine is not ready');
      return work(engine, text);
    });
  return call as EngineCall<T>;
}

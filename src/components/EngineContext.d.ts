import type React from 'react';
import type { TranslationEngine } from '../types/TranslationEngineTypes';

/**
 * Types for `EngineContext.jsx`, which stays JavaScript.
 *
 * Hand-written rather than inferred: `createContext(undefined)` infers `undefined`, so
 * every TypeScript consumer would otherwise destructure `never`. Keep this in step with
 * the provider's `value` object by hand — `checkJs` is off, so nothing checks it for you.
 */
export interface EngineContextValue {
  enginePhase: 'loading' | 'ready' | 'error';
  engineRef: React.MutableRefObject<TranslationEngine | null>;
  /** Increments once per constructed engine — the cache-invalidation signal. */
  engineVersion: number;
  initError: string | null;
  activeProperNounsFromConfig: string[] | null;
  reinitialize: (
    rawDictionaries: Record<string, unknown>,
    options?: {
      forceConfigReload?: boolean;
      priorities?: Record<string, number>;
      debugLevel?: number;
    }
  ) => Promise<void>;
  reinitializeEngine: (...args: unknown[]) => unknown;
}

export declare function EngineProvider(props: { children: React.ReactNode }): React.JSX.Element;

/** @throws when used outside an `EngineProvider`. */
export declare function useEngine(): EngineContextValue;

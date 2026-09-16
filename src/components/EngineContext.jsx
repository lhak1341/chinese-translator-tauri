import { createContext, useContext, useMemo } from 'react';
import { useTranslatorEngine } from '../hooks/useTranslatorEngine';
import { useEngineReinitializer } from '../hooks/useEngineReinitializer';
import ErrorBoundary from './ErrorBoundary';

/**
 * Owns the single translation engine instance for the whole app.
 *
 * Only one engine may exist at a time — the WASM pattern/number processors
 * are module-scope singletons, so initializing a second engine would silently
 * re-point the shared WASM processor at that engine's dictionaries out from
 * under the first. Sits above the tab container so every tab that needs
 * translation (Translator, and future tabs) shares the one instance instead
 * of each owning its own.
 *
 * Wraps children in ErrorBoundary — an engine-initialization failure is now a
 * shared-state failure for every consuming tab, not something local to one.
 */
const EngineContext = createContext(undefined);

export function EngineProvider({ children }) {
  const { enginePhase, engineRef, initError, activeProperNounsFromConfig, reinitialize } =
    useTranslatorEngine();
  const reinitializeEngine = useEngineReinitializer(reinitialize, engineRef);

  const value = useMemo(
    () => ({
      enginePhase,
      engineRef,
      initError,
      activeProperNounsFromConfig,
      reinitialize,
      reinitializeEngine,
    }),
    [
      enginePhase,
      engineRef,
      initError,
      activeProperNounsFromConfig,
      reinitialize,
      reinitializeEngine,
    ]
  );

  return (
    <ErrorBoundary>
      <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
    </ErrorBoundary>
  );
}

/**
 * Hook to access the shared translation engine context.
 *
 * @throws Error if used outside an EngineProvider
 */
export function useEngine() {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
}

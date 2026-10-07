import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { useTranslatorEngine } from '../hooks/useTranslatorEngine';
import { createEngineAccess } from '../utils/EngineAccess';
import { useVisibleTab } from './VisibleTabContext';
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
 * Also owns who may call it: `engineAccess` (`src/utils/EngineAccess.ts`) is the one queue
 * for both translating tabs, with ownership following the visible tab. It sits below
 * `VisibleTabProvider` for that reason.
 *
 * Wraps children in ErrorBoundary, and names what that boundary's fallback means: it
 * sits above every tab, so any tab failing to render takes all of them down. It never
 * sees an engine-initialization failure — this component's own hooks run outside its
 * boundary, and `reinitializeEngine` reports failures through `initError` rather than
 * throwing — so each tab shows that itself (the Translator's error panel,
 * `ReaderEngineErrorBanner`).
 */
const EngineContext = createContext(undefined);

const TAB_FAILURE_DESCRIPTION =
  'A tab failed to display. Every tab shares this one error screen, so the whole ' +
  'application is down until it reloads.';

export function EngineProvider({ children }) {
  const { enginePhase, engineRef, engineVersion, initError, reinitialize, destroyEngine } =
    useTranslatorEngine();

  // Read when a call is made, not when it is queued, so the access never goes stale and
  // never needs rebuilding on a tab switch (the latest-ref pattern).
  const { visibleTab } = useVisibleTab();
  const visibleTabRef = useRef(visibleTab);
  visibleTabRef.current = visibleTab;
  const [engineAccess] = useState(() =>
    createEngineAccess({
      getEngine: () => engineRef.current,
      getVisibleTab: () => visibleTabRef.current,
    })
  );

  const value = useMemo(
    () => ({
      enginePhase,
      engineRef,
      engineAccess,
      engineVersion,
      initError,
      reinitializeEngine: reinitialize,
      destroyEngine,
    }),
    [enginePhase, engineRef, engineAccess, engineVersion, initError, reinitialize, destroyEngine]
  );

  return (
    <ErrorBoundary description={TAB_FAILURE_DESCRIPTION}>
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

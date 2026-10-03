import { useEffect, useRef } from 'react';
import TabbedInterface from './components/TabbedInterface';
import { DictionaryProvider } from './components/dictionary/DictionaryContext';
import { EngineProvider } from './components/EngineContext';
import { BookBindingProvider } from './components/BookBindingContext';
import { VisibleTabProvider } from './components/VisibleTabContext';
import { ToastProvider, useToast, setGlobalToast } from './components/ToastContext';
import { logger } from './utils/logger';
import { applyAppearanceToCssVars } from './utils/ui/AppearanceReducer';
import { loadAppearanceConfig } from './utils/appearanceConfig';
import { flushPendingPosition } from './utils/reader/PendingPositionFlush';
// NOTE: WASM singleton cleanup intentionally NOT called from App unmount.
// Module-level WASM singletons (WasmNumberProcessor, WasmPatternProcessor,
// wasmMemoryPoolManager)
// live for the app lifetime. Calling their cleanup() on App unmount races
// with module-load IIFE auto-init under React 18 StrictMode dev double-mount,
// and provides no benefit (App is the root component and never unmounts in
// production). Use the `reinitializeWasm*` paths for legitimate reset flows.

function App() {
  // Mounted-ref guards async work (loadAppearanceSettings) from applying
  // CSS variable changes after unmount during StrictMode dev double-mount.
  const isMountedRef = useRef(true);

  // Load and apply appearance settings on app start
  useEffect(() => {
    isMountedRef.current = true;

    const loadAppearanceSettings = async () => {
      try {
        const appearance = await loadAppearanceConfig();
        if (!isMountedRef.current) return;
        applyAppearanceToCssVars(appearance);
      } catch (error) {
        if (!isMountedRef.current) return;
        logger.error('Failed to load appearance settings:', error);
      }
    };

    loadAppearanceSettings();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Flush any pending Reader position write before the window actually closes — the
  // debounce (see ReadingAnchor) means a scroll right before quitting could
  // otherwise never reach disk. Dynamically imported: `@tauri-apps/api/window` touches
  // the Tauri IPC bridge at module load, which the vitest/jsdom test environment doesn't
  // provide, and this app has no non-Tauri (browser-only) target to support instead.
  useEffect(() => {
    let unlisten;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (cancelled) return;
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          await flushPendingPosition();
          await getCurrentWindow().destroy();
        });
      } catch (error) {
        logger.warn('Failed to register close-requested flush:', error);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <ToastProvider>
      <DictionaryProvider>
        <AppContent />
      </DictionaryProvider>
    </ToastProvider>
  );
}

// Inner component to register global toast API
function AppContent() {
  const toast = useToast();

  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <EngineProvider>
        {/* Inside EngineProvider: applying a binding reinitializes the engine, and the
            binding is the authority on the fiction slice of activeProperNouns for every
            tab, not just the Reader — so it lives above the tab container too. */}
        <BookBindingProvider>
          <VisibleTabProvider>
            <TabbedInterface />
          </VisibleTabProvider>
        </BookBindingProvider>
      </EngineProvider>
    </div>
  );
}

export default App;

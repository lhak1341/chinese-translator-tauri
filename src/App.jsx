import { useEffect, useRef } from 'react';
import TabbedInterface from './components/TabbedInterface';
import { DictionaryProvider } from './components/dictionary/DictionaryContext';
import { EngineProvider } from './components/EngineContext';
import { BookBindingProvider } from './components/BookBindingContext';
import { ToastProvider, useToast, setGlobalToast } from './components/ToastContext';
import { performanceHealth } from './utils/performance';
import { logger } from './utils/logger';
import { applyAppearanceToCssVars } from './utils/ui/AppearanceReducer';
import { loadAppearanceConfig } from './utils/appearanceConfig';
import { flushPendingPosition } from './utils/reader/PendingPositionFlush';
// NOTE: WASM singleton cleanup intentionally NOT called from App unmount.
// Module-level WASM singletons (WasmNumberProcessor, WasmPatternProcessor,
// rustLookupIndexManager, wasmMemoryPoolManager)
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

    const initializePerformanceMonitoring = () => {
      // Start system-wide performance regression detection
      performanceHealth.startMonitoring(30000); // 30-second intervals
      logger.log('📊 Performance monitoring initialized:', {
        status: performanceHealth.getReport().status,
      });

      // Set up cleanup on unmount.
      // Only stop the performance monitor (it owns a setInterval). Do NOT touch
      // WASM/cache singletons here — they outlive React component lifecycle and
      // calling their .cleanup() races with module-load auto-init under StrictMode.
      return () => {
        performanceHealth.destroy();
        logger.log('🔍 Performance monitoring destroyed');
      };
    };

    loadAppearanceSettings();

    const cleanup = initializePerformanceMonitoring();

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  // Flush any pending Reader position write before the window actually closes — the
  // debounce (see useReadingPosition) means a scroll right before quitting could
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
          <TabbedInterface />
        </BookBindingProvider>
      </EngineProvider>
    </div>
  );
}

export default App;

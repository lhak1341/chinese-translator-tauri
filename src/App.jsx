import { useEffect, useRef } from 'react';
import TabbedInterface from './components/TabbedInterface';
import { DictionaryProvider } from './components/dictionary/DictionaryContext';
import { ToastProvider, useToast, setGlobalToast } from './components/ToastContext';
import { systemPerformanceMonitor } from './utils/performance';
import { logger } from './utils/logger';
import { applyAppearanceToCssVars } from './utils/ui/AppearanceReducer';
import { DEFAULT_APPEARANCE } from './hooks/useAppearanceSettings';
// NOTE: WASM singleton cleanup intentionally NOT called from App unmount.
// Module-level WASM singletons (WasmNumberProcessor, WasmPatternProcessor,
// rustLookupIndexManager, wasmMemoryPoolManager, contentAwarePositionCache)
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
        const result = await window.electronAPI.loadAppearanceSettings();
        if (!isMountedRef.current) return;
        if (result.success && result.data) {
          const raw = result.data;
          applyAppearanceToCssVars({
            chineseText: { ...DEFAULT_APPEARANCE.chineseText, ...raw.chineseText },
            fullTranslation: { ...DEFAULT_APPEARANCE.fullTranslation, ...raw.fullTranslation },
            characterOnly: { ...DEFAULT_APPEARANCE.characterOnly, ...raw.characterOnly },
            uiFont: { ...DEFAULT_APPEARANCE.uiFont, ...(raw.uiFont || {}) },
            theme: raw.theme || DEFAULT_APPEARANCE.theme,
            characterOnlyFollowsFullTranslation:
              raw.characterOnlyFollowsFullTranslation ??
              DEFAULT_APPEARANCE.characterOnlyFollowsFullTranslation,
          });
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        logger.error('Failed to load appearance settings:', error);
      }
    };

    const initializePerformanceMonitoring = () => {
      // Start system-wide performance regression detection
      systemPerformanceMonitor.startMonitoring(30000); // 30-second intervals

      // Log initial health status
      const healthReport = systemPerformanceMonitor.getSystemHealthReport();
      logger.log('📊 Performance monitoring initialized:', {
        status: healthReport.status,
        integrations: systemPerformanceMonitor.integrations.size,
        memoryPressure: (healthReport.systemMetrics.memory.pressure * 100).toFixed(1) + '%',
      });

      // Set up cleanup on unmount.
      // Only stop the performance monitor (it owns a setInterval). Do NOT touch
      // WASM/cache singletons here — they outlive React component lifecycle and
      // calling their .cleanup() races with module-load auto-init under StrictMode.
      return () => {
        systemPerformanceMonitor.destroy();
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
      <TabbedInterface />
    </div>
  );
}

export default App;

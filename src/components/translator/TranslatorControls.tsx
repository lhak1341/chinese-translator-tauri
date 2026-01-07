import React from 'react';
import { ClipboardPaste, PlusCircle, RotateCcw } from 'lucide-react';

/**
 * Performance statistics for translation operations
 */
interface PerformanceStats {
  operations: number;
  avgTime: number;
  cacheHitRate: number;
}

/**
 * WASM engine status information
 */
interface WasmStatus {
  initialized: boolean;
  fallbackMode: boolean;
  totalEntries: number;
}

/**
 * Performance regression health status
 */
interface RegressionHealth {
  status: 'healthy' | 'warning' | 'critical';
  criticalAlerts: number;
  warningAlerts: number;
  baselines: number;
}

/**
 * Batch translation progress information
 */
interface ProgressInfo {
  currentBatch: number;
  totalBatches: number;
  completedChunks: number;
  totalChunks: number;
}

/**
 * Throttled streaming state for UI updates
 */
interface ThrottledStreamingState {
  isStreaming: boolean;
  progress: number;
  completedChunks: number;
  totalChunks: number;
}

/**
 * Props for TranslatorControls component
 */
interface TranslatorControlsProps {
  // Handlers
  handleTranslateFromClipboard: () => Promise<void>;
  handleQuickAddProperNoun: () => void;
  handleForceReload: () => Promise<void>;

  // State
  isLoading: boolean;
  isTranslating: boolean;
  progressInfo: ProgressInfo | null;
  activeTranslations: number;

  // Performance stats
  performanceStats: PerformanceStats;
  wasmStatus: WasmStatus;
  regressionHealth: RegressionHealth;
  throttledStreamingState: ThrottledStreamingState;
}

/**
 * TranslatorControls Component
 *
 * Renders the control buttons row including:
 * - Translate from clipboard button
 * - Quick Add Entry button
 * - Reload Dictionary button
 * - Progress/Performance indicators
 * - Streaming progress display
 *
 * @param props - Component props
 * @returns Control buttons and status displays
 */
export default function TranslatorControls({
  // Handlers
  handleTranslateFromClipboard,
  handleQuickAddProperNoun,
  handleForceReload,

  // State
  isLoading,
  isTranslating,
  progressInfo,
  activeTranslations,

  // Performance stats
  performanceStats,
  wasmStatus,
  regressionHealth,
  throttledStreamingState,
}: TranslatorControlsProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        justifyContent: 'flex-start',
        paddingLeft: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <button
        onClick={handleTranslateFromClipboard}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          backgroundColor: 'var(--success-bg)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
        title="Translate from Clipboard (Ctrl/Cmd + Shift + V)"
        disabled={isLoading || isTranslating}
      >
        <ClipboardPaste size={16} />
        {isLoading
          ? 'Loading dictionaries...'
          : isTranslating
            ? 'Translating...'
            : 'Translate from Clipboard'}
      </button>

      {/* Add Quick Add Entry button */}
      <button
        onClick={handleQuickAddProperNoun}
        className="secondary"
        title="Quick Add Entry - Keyboard shortcuts:
Cmd/Ctrl+1: Character
Cmd/Ctrl+2: Phrase
Cmd/Ctrl+3: Proper Noun
Cmd/Ctrl+4: Pattern
Cmd/Ctrl+5: Custom Proper Noun"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <PlusCircle size={16} />
        Quick Add Entry
      </button>

      {/* Reload Dictionary button */}
      <button
        onClick={handleForceReload}
        className="secondary"
        title="Reload Dictionary - Clear all caches and reinitialize engine"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          backgroundColor: 'var(--error-bg)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
        }}
        disabled={isLoading}
      >
        <RotateCcw size={16} />
        Reload Dictionary
      </button>

      {progressInfo ? (
        <div
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--success-bg)',
            color: 'white',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: '500',
          }}
        >
          🔄 Translating batch {progressInfo.currentBatch} of {progressInfo.totalBatches} (
          {progressInfo.completedChunks}/{progressInfo.totalChunks} chunks)
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {/* Compact Performance Display */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Combined Performance Stats */}
            <div
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--nav-hover)',
                borderRadius: '0.375rem',
                fontSize: '0.7rem',
                color: 'var(--nav-text)',
                border:
                  performanceStats.cacheHitRate > 50
                    ? '1px solid #10b981'
                    : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <span>⚡ {Math.round(performanceStats.avgTime)}ms</span>
              <span>💾 {Math.round(performanceStats.cacheHitRate)}%</span>
              <span>#{performanceStats.operations}</span>
              {process.env.NODE_ENV === 'development' && wasmStatus.initialized && (
                <span style={{ color: wasmStatus.fallbackMode ? '#f59e0b' : '#8b5cf6' }}>
                  {wasmStatus.fallbackMode ? 'JS' : 'WASM'}{' '}
                  {Math.round(wasmStatus.totalEntries / 1000)}k
                </span>
              )}
              {/* Regression Detection Health Indicator */}
              <span
                style={{
                  color:
                    regressionHealth.status === 'critical'
                      ? '#ef4444'
                      : regressionHealth.status === 'warning'
                        ? '#f59e0b'
                        : '#10b981',
                }}
                title={`Performance Health: ${regressionHealth.status.toUpperCase()} • Baselines: ${regressionHealth.baselines} • Alerts: ${regressionHealth.criticalAlerts + regressionHealth.warningAlerts}`}
              >
                📊{' '}
                {regressionHealth.status === 'critical'
                  ? '🔴'
                  : regressionHealth.status === 'warning'
                    ? '🟡'
                    : '🟢'}
                {regressionHealth.baselines}
                {(regressionHealth.criticalAlerts > 0 || regressionHealth.warningAlerts > 0) && (
                  <span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>
                    !{regressionHealth.criticalAlerts + regressionHealth.warningAlerts}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Streaming Progress (simplified) */}
          {throttledStreamingState.isStreaming && (
            <div
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--streaming-accent-light)',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                color: 'var(--streaming-accent)',
                border: '1px solid var(--streaming-accent)',
              }}
            >
              🔄 Translating: {Math.round(throttledStreamingState.progress)}% (
              {throttledStreamingState.completedChunks}/{throttledStreamingState.totalChunks})
            </div>
          )}
        </div>
      )}

      {activeTranslations > 0 && (
        <div
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTranslations > 1 ? 'var(--warning-bg)' : 'var(--success-bg)',
            color: 'white',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: '500',
          }}
        >
          🔄 {activeTranslations} active
        </div>
      )}
    </div>
  );
}

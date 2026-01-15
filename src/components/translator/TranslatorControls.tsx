import React from 'react';
import { ClipboardPaste, PlusCircle, RotateCcw, Zap, Database, Activity } from 'lucide-react';

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
  handleTranslateFromClipboard: () => Promise<void>;
  handleQuickAddProperNoun: () => void;
  handleForceReload: () => Promise<void>;
  isLoading: boolean;
  isTranslating: boolean;
  progressInfo: ProgressInfo | null;
  activeTranslations: number;
  performanceStats: PerformanceStats;
  wasmStatus: WasmStatus;
  regressionHealth: RegressionHealth;
  throttledStreamingState: ThrottledStreamingState;
}

/**
 * TranslatorControls Component
 *
 * Control buttons row with flat, bold styling
 */
export default function TranslatorControls({
  handleTranslateFromClipboard,
  handleQuickAddProperNoun,
  handleForceReload,
  isLoading,
  isTranslating,
  progressInfo,
  activeTranslations,
  performanceStats,
  wasmStatus,
  regressionHealth,
  throttledStreamingState,
}: TranslatorControlsProps): React.ReactElement {
  const healthColor =
    regressionHealth.status === 'critical'
      ? 'var(--error-color)'
      : regressionHealth.status === 'warning'
        ? 'var(--warning-color)'
        : 'var(--success-color)';

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {/* Primary Action - Translate */}
      <button
        onClick={handleTranslateFromClipboard}
        disabled={isLoading || isTranslating}
        title="Translate from Clipboard (Ctrl/Cmd + Shift + V)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem 0.875rem',
          fontSize: '0.8125rem',
          fontWeight: 500,
          borderRadius: 'var(--radius-md)',
          cursor: isLoading || isTranslating ? 'not-allowed' : 'pointer',
          border: 'none',
          background: 'var(--primary-color)',
          color: 'white',
          opacity: isLoading || isTranslating ? 0.6 : 1,
          transition: 'all 0.15s ease',
        }}
      >
        <ClipboardPaste size={15} />
        {isLoading ? 'Loading...' : isTranslating ? 'Translating...' : 'Translate'}
      </button>

      {/* Add Entry */}
      <button
        onClick={handleQuickAddProperNoun}
        title="Quick Add Entry (Cmd/Ctrl + 1-5)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem 0.875rem',
          fontSize: '0.8125rem',
          fontWeight: 500,
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          border: '1px solid var(--border-color)',
          background: 'var(--surface-color)',
          color: 'var(--text-color)',
          transition: 'all 0.15s ease',
        }}
      >
        <PlusCircle size={15} />
        Add Entry
      </button>

      {/* Reload */}
      <button
        onClick={handleForceReload}
        disabled={isLoading}
        title="Reload Dictionary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem 0.875rem',
          fontSize: '0.8125rem',
          fontWeight: 500,
          borderRadius: 'var(--radius-md)',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          border: 'none',
          background: 'var(--error-subtle)',
          color: 'var(--error-color)',
          opacity: isLoading ? 0.6 : 1,
          transition: 'all 0.15s ease',
        }}
      >
        <RotateCcw size={15} />
        Reload
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Progress or Stats */}
      {progressInfo ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'var(--success-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--success-color)',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'currentColor',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          Batch {progressInfo.currentBatch}/{progressInfo.totalBatches}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Stats chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.5rem 0.75rem',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Zap size={12} style={{ color: 'var(--warning-color)' }} />
              {Math.round(performanceStats.avgTime)}ms
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Database
                size={12}
                style={{
                  color:
                    performanceStats.cacheHitRate > 50
                      ? 'var(--success-color)'
                      : 'var(--text-muted)',
                }}
              />
              {Math.round(performanceStats.cacheHitRate)}%
            </span>
            {process.env.NODE_ENV === 'development' && wasmStatus.initialized && (
              <span
                style={{
                  color: wasmStatus.fallbackMode ? 'var(--warning-color)' : 'var(--primary-color)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {wasmStatus.fallbackMode ? 'JS' : 'WASM'}
              </span>
            )}
            <span
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: healthColor }}
            >
              <Activity size={12} />
            </span>
          </div>

          {/* Streaming progress */}
          {throttledStreamingState.isStreaming && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--primary-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                color: 'var(--primary-color)',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '4px',
                  background: 'var(--border-color)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${throttledStreamingState.progress}%`,
                    height: '100%',
                    background: 'var(--primary-color)',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
              {Math.round(throttledStreamingState.progress)}%
            </div>
          )}
        </div>
      )}

      {/* Active badge */}
      {activeTranslations > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            background: activeTranslations > 1 ? 'var(--warning-subtle)' : 'var(--success-subtle)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: activeTranslations > 1 ? 'var(--warning-color)' : 'var(--success-color)',
          }}
        >
          <div
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'currentColor',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          {activeTranslations} active
        </div>
      )}
    </div>
  );
}

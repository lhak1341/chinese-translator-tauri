import React from 'react';
import { ClipboardPaste, PlusCircle, RotateCcw, Zap, Activity } from 'lucide-react';
import styles from '../../styles/TranslatorControls.module.css';

/**
 * Performance statistics for translation operations
 */
interface PerformanceStats {
  operations: number;
  avgTime: number;
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
 * Props for TranslatorControls component
 */
interface TranslatorControlsProps {
  handleTranslateFromClipboard: () => Promise<void>;
  handleQuickAddProperNoun: () => void;
  handleForceReload: () => Promise<void>;
  isLoading: boolean;
  isReloading: boolean;
  isTranslating: boolean;
  progressInfo: ProgressInfo | null;
  activeTranslations: number;
  performanceStats: PerformanceStats;
  wasmStatus: WasmStatus;
  regressionHealth: RegressionHealth;
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
  isReloading,
  isTranslating,
  progressInfo,
  activeTranslations,
  performanceStats,
  wasmStatus,
  regressionHealth,
}: TranslatorControlsProps): React.ReactElement {
  const healthColor =
    regressionHealth.status === 'critical'
      ? 'var(--error-color)'
      : regressionHealth.status === 'warning'
        ? 'var(--warning-color)'
        : 'var(--success-color)';

  return (
    <div className={styles.container}>
      {/* Primary Action - Translate */}
      <button
        onClick={handleTranslateFromClipboard}
        disabled={isLoading || isTranslating}
        title="Translate from Clipboard (Ctrl/Cmd + Shift + V)"
        aria-label={
          isLoading
            ? 'Loading dictionaries'
            : isTranslating
              ? 'Translation in progress'
              : 'Translate text from clipboard'
        }
        className={`${styles.button} ${styles.buttonPrimary} ${isLoading || isTranslating ? styles.buttonDisabled : styles.buttonEnabled}`}
        style={{ opacity: isLoading || isTranslating ? 0.6 : 1 }}
      >
        <ClipboardPaste size={15} aria-hidden="true" />
        {isLoading ? 'Loading...' : isTranslating ? 'Translating...' : 'Translate'}
      </button>

      {/* Add Entry */}
      <button
        onClick={handleQuickAddProperNoun}
        title="Quick Add Entry (Cmd/Ctrl + 1-5 for specific dictionary types)"
        aria-label="Quick add proper noun dictionary entry"
        className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonEnabled}`}
      >
        <PlusCircle size={15} aria-hidden="true" />
        Add Entry
      </button>

      {/* Reload */}
      <button
        onClick={handleForceReload}
        disabled={isLoading || isReloading}
        title={isReloading ? 'Reload in progress...' : 'Reload Dictionary'}
        aria-label={
          isReloading
            ? 'Reload in progress'
            : isLoading
              ? 'Reload disabled while loading'
              : 'Reload dictionaries from storage'
        }
        className={`${styles.button} ${styles.buttonReload} ${isLoading || isReloading ? styles.buttonDisabled : styles.buttonEnabled}`}
        style={{ opacity: isLoading || isReloading ? 0.6 : 1 }}
      >
        <RotateCcw size={15} aria-hidden="true" />
        {isReloading ? 'Reloading...' : 'Reload'}
      </button>

      {/* Spacer */}
      <div className={styles.spacer} />

      {/* Stats chip — always visible, right-aligned via spacer */}
      <div
        className={styles.statsChip}
        role="status"
        aria-label="Translation performance statistics"
      >
        <span className={styles.statItem}>
          <Zap size={12} style={{ color: 'var(--warning-color)' }} aria-hidden="true" />
          {Math.round(performanceStats.avgTime)}ms
        </span>
        {process.env.NODE_ENV === 'development' && wasmStatus.initialized && (
          <span
            className={styles.wasmStatus}
            style={{
              color: wasmStatus.fallbackMode ? 'var(--warning-color)' : 'var(--primary-color)',
            }}
            aria-label={
              wasmStatus.fallbackMode
                ? 'Using JavaScript fallback'
                : 'Using WebAssembly acceleration'
            }
          >
            {wasmStatus.fallbackMode ? 'JS' : 'WASM'}
          </span>
        )}
        <span className={styles.statItem} style={{ color: healthColor }}>
          <Activity size={12} aria-hidden="true" />
        </span>
      </div>

      {/* Batch progress pill — conditionally rendered, fades in on mount */}
      {progressInfo && (
        <div className={styles.progressIndicator} role="status" aria-live="polite">
          <div className={styles.pulseDot} />
          Batch {progressInfo.currentBatch}/{progressInfo.totalBatches}
        </div>
      )}

      {/* Active badge — conditionally rendered, fades in on mount */}
      {activeTranslations > 0 && (
        <div
          className={`${styles.activeBadge} ${activeTranslations > 1 ? styles.activeBadgeMultiple : styles.activeBadgeSingle}`}
        >
          <div className={styles.activeBadgeDot} />
          {activeTranslations} active
        </div>
      )}
    </div>
  );
}

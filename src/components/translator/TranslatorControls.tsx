import React from 'react';
import { ClipboardPaste, PlusCircle, RotateCcw, Zap, Command } from 'lucide-react';
import styles from '../../styles/TranslatorControls.module.css';

/** Quick-add hotkeys 1-7 — see docs/HOTKEYS.md's Translator-tab table (single source of
 * truth for the actual dispatch: src/utils/ui/HotkeyDispatchTable.ts). Keep in sync if
 * that table changes. */
const QUICK_ADD_HINTS: readonly [key: string, label: string][] = [
  ['1', 'Char'],
  ['2', 'Phrase'],
  ['3', 'Name'],
  ['4', 'Pattern'],
  ['5', 'Novel Name'],
  ['6', 'Novel Pattern'],
  ['7', 'Rule'],
];

/**
 * The streaming-state fields the progress pill reads (useStreamingTranslation, ADR-105)
 */
interface StreamingProgress {
  isStreaming: boolean;
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
  throttledStreamingState: StreamingProgress;
  avgTime: number;
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
  throttledStreamingState,
  avgTime,
}: TranslatorControlsProps): React.ReactElement {
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
        title="Add Entry (Cmd/Ctrl + 1-5 for specific dictionary types)"
        aria-label="Add proper noun dictionary entry"
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

      {/* Hotkey hints — fainted strip, see docs/HOTKEYS.md */}
      <div className={styles.hotkeyHints} title="Quick-add hotkeys (see each button's tooltip)">
        <span className={styles.hintModKey}>
          <Command size={10} aria-hidden="true" />
        </span>
        {QUICK_ADD_HINTS.map(([key, label]) => (
          <span key={key} className={styles.hintChip}>
            <span className={styles.hintKey}>{key}</span>
            <span className={styles.hintLabel}>{label}</span>
          </span>
        ))}
      </div>

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
          {Math.round(avgTime)}ms
        </span>
      </div>

      {/* Batch progress pill — conditionally rendered, fades in on mount */}
      {throttledStreamingState.isStreaming && throttledStreamingState.totalChunks > 0 && (
        <div className={styles.progressIndicator} role="status" aria-live="polite">
          <div className={styles.pulseDot} />
          {throttledStreamingState.completedChunks}/{throttledStreamingState.totalChunks} chunks
        </div>
      )}
    </div>
  );
}

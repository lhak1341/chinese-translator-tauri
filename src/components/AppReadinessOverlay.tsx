import React from 'react';
import styles from '../styles/AppReadinessOverlay.module.css';

/**
 * Stage status — `pending` not yet reached, `active` in progress, `done` complete.
 */
type StageStatus = 'pending' | 'active' | 'done';

interface AppReadinessOverlayProps {
  /** Dictionary load in progress (DictionaryContext.isLoading) */
  dictLoading: boolean;
  /** Translation engine initializing (after dicts load, before engineInitialized) */
  engineInitializing: boolean;
  /**
   * Optional WASM initialization status. Currently the translation engine awaits
   * pattern WASM internally before resolving `engineInitialized`, so this stage
   * is folded into engineInitializing — the prop is kept for future granularity
   * (e.g. surfacing pattern-WASM cooldown states).
   */
  wasmInitializing?: boolean;
}

function pickStatus(active: boolean, doneAfter: boolean): StageStatus {
  if (doneAfter) return 'done';
  if (active) return 'active';
  return 'pending';
}

function stageClass(status: StageStatus): string {
  if (status === 'active') return `${styles.stage} ${styles.stageActive}`;
  if (status === 'done') return `${styles.stage} ${styles.stageDone}`;
  return styles.stage;
}

function stageIcon(status: StageStatus): string {
  if (status === 'done') return '✓';
  if (status === 'active') return '⏳';
  return '·';
}

/**
 * AppReadinessOverlay
 *
 * Full-panel overlay shown until the translator is ready to accept input.
 * Caller decides when to render (presence) and when to hide (absence) — this
 * component renders unconditionally when mounted. Place inside a
 * `position: relative` container so the absolute overlay covers it.
 *
 * Stages (computed from props):
 *   1. Loading dictionaries
 *   2. Initializing translation engine
 *
 * The engine initialization phase internally awaits WASM pattern processor
 * setup, so users see a single "Initializing translation engine" stage that
 * spans WASM init too. If WASM falls back gracefully, the stage still
 * completes — failure is surfaced separately via toasts/error banners.
 */
const AppReadinessOverlay: React.FC<AppReadinessOverlayProps> = ({
  dictLoading,
  engineInitializing,
}) => {
  const dictStatus: StageStatus = pickStatus(dictLoading, !dictLoading);
  const engineStatus: StageStatus = !dictLoading
    ? pickStatus(engineInitializing, !engineInitializing && !dictLoading)
    : 'pending';

  // Phrasing for the title reflects the current foreground stage.
  const title = dictLoading
    ? 'Loading dictionaries…'
    : engineInitializing
      ? 'Initializing translation engine…'
      : 'Preparing translator…';

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <div className={styles.spinner} aria-hidden="true" />
        <h2 className={styles.title}>{title}</h2>
        <ul className={styles.stages}>
          <li className={stageClass(dictStatus)}>
            <span className={styles.stageIcon} aria-hidden="true">
              {stageIcon(dictStatus)}
            </span>
            <span>Loading dictionaries</span>
          </li>
          <li className={stageClass(engineStatus)}>
            <span className={styles.stageIcon} aria-hidden="true">
              {stageIcon(engineStatus)}
            </span>
            <span>Initializing translation engine</span>
          </li>
        </ul>
        <p className={styles.hint}>This usually takes a moment on first launch.</p>
      </div>
    </div>
  );
};

export default AppReadinessOverlay;

/**
 * Clear any persisted panel/layout keys from localStorage on schema-version mismatch.
 *
 * Bump PANEL_LAYOUT_SCHEMA_VERSION whenever the default panel layout structure
 * changes incompatibly — that triggers a one-time wipe so users get the new
 * defaults. Otherwise user-resized panel sizes persist across app restarts.
 */
const PANEL_LAYOUT_SCHEMA_VERSION = '1';
const VERSION_KEY = 'panelLayoutSchemaVersion';

export function clearPanelLayoutStorage(): void {
  try {
    if (localStorage.getItem(VERSION_KEY) === PANEL_LAYOUT_SCHEMA_VERSION) return;
  } catch {
    // localStorage unavailable (rare) — proceed with clear
  }

  const keys = Object.keys(localStorage).filter(
    (key) =>
      key.includes('panel') ||
      key.includes('layout') ||
      key.includes('Group') ||
      key.includes('main-layout') ||
      key.includes('left-column')
  );
  keys.forEach((key) => localStorage.removeItem(key));

  try {
    localStorage.setItem(VERSION_KEY, PANEL_LAYOUT_SCHEMA_VERSION);
  } catch {
    // localStorage unavailable — wipe still completed, may repeat next launch
  }
}

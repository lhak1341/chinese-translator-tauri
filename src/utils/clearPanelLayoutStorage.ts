/**
 * Clear any persisted panel/layout keys from localStorage that could override
 * the application's default panel sizes on startup.
 *
 * Called once at app startup (main.jsx) — not on every component mount.
 */
export function clearPanelLayoutStorage(): void {
  const keys = Object.keys(localStorage).filter(
    (key) =>
      key.includes('panel') ||
      key.includes('layout') ||
      key.includes('Group') ||
      key.includes('main-layout') ||
      key.includes('left-column')
  );
  keys.forEach((key) => localStorage.removeItem(key));
}

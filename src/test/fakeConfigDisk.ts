import { vi } from 'vitest';
import { invalidateAppConfig } from '../utils/appConfig';

/**
 * A fake `config.json` behind `window.electronAPI.loadConfiguration/saveConfiguration`, for
 * tests that want the real `appConfig` module — its lock, its diff and its no-op saves —
 * instead of a hand-written module mock. Mutate `disk.raw` to play a Rust-side write; the
 * app's own saves land in it.
 *
 * Call it after the test has assigned its own `window.electronAPI`: it adds to that object.
 */
export function installFakeConfigDisk(initial: Record<string, unknown> = {}) {
  invalidateAppConfig();
  const disk = {
    raw: {
      activeProperNouns: ['properNouns'],
      defaultQuickAddDictionary: null,
      lastSelectedDictionary: null,
      ...initial,
    } as Record<string, unknown>,
  };
  const loadConfiguration = vi.fn(async () => ({ success: true, data: { ...disk.raw } }));
  const saveConfiguration = vi.fn(async (raw: unknown) => {
    disk.raw = { ...(raw as Record<string, unknown>) };
    return { success: true };
  });
  const api = ((window as unknown as { electronAPI?: object }).electronAPI ??= {});
  Object.assign(api, { loadConfiguration, saveConfiguration });
  return { disk, loadConfiguration, saveConfiguration };
}

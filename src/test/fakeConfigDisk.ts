import { invalidateAppConfig } from '../utils/appConfig';
import { installFakeAppFile } from './fakeAppFile';

/**
 * A fake `config.json` behind `window.electronAPI.loadConfiguration/saveConfiguration`, for
 * tests that want the real `appConfig` module — its lock, its diff and its no-op saves —
 * instead of a hand-written module mock. Mutate `disk.raw` to play a Rust-side write; the
 * app's own saves land in it. A thin wrapper over `installFakeAppFile`.
 *
 * Call it after the test has assigned its own `window.electronAPI`: it adds to that object.
 */
export function installFakeConfigDisk(initial: Record<string, unknown> = {}) {
  invalidateAppConfig();
  const { disk, load, save } = installFakeAppFile<Record<string, unknown>>(
    { load: 'loadConfiguration', save: 'saveConfiguration' },
    {
      activeProperNouns: ['properNouns'],
      defaultQuickAddDictionary: null,
      lastSelectedDictionary: null,
      ...initial,
    },
    (raw) => ({ ...raw })
  );
  return {
    disk: {
      get raw() {
        return disk.data;
      },
      set raw(value: Record<string, unknown>) {
        disk.data = value;
      },
    },
    loadConfiguration: load,
    saveConfiguration: save,
  };
}

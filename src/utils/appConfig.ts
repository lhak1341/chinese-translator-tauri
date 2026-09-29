import { createAppFile } from './appFile';
import type { AppConfiguration } from '../types/ComponentTypes';

export interface EngineConfig {
  activeProperNouns: string[];
}

export interface UIConfig {
  defaultQuickAddDictionary: string | null;
}

export interface SessionConfig {
  lastSelectedDictionary: string | null;
}

export interface ReaderConfig {
  /**
   * Library root for the Reader's bookshelf. `null` means "use the default", which Rust
   * resolves (and reports back) rather than the frontend hard-coding a path.
   */
  libraryPath: string | null;
}

export interface AppConfig {
  engine: EngineConfig;
  ui: UIConfig;
  session: SessionConfig;
  reader: ReaderConfig;
}

const ENGINE_DEFAULTS: EngineConfig = {
  activeProperNouns: ['properNouns'],
};

function fromRaw(raw: Record<string, unknown>): AppConfig {
  return {
    engine: {
      activeProperNouns:
        Array.isArray(raw.activeProperNouns) &&
        raw.activeProperNouns.every((v) => typeof v === 'string')
          ? (raw.activeProperNouns as string[])
          : ENGINE_DEFAULTS.activeProperNouns,
    },
    ui: {
      defaultQuickAddDictionary:
        typeof raw.defaultQuickAddDictionary === 'string' ? raw.defaultQuickAddDictionary : null,
    },
    session: {
      lastSelectedDictionary:
        typeof raw.lastSelectedDictionary === 'string' ? raw.lastSelectedDictionary : null,
    },
    reader: {
      libraryPath: typeof raw.libraryPath === 'string' ? raw.libraryPath : null,
    },
  };
}

function toRaw(config: AppConfig): AppConfiguration {
  return {
    activeProperNouns: config.engine.activeProperNouns,
    defaultQuickAddDictionary: config.ui.defaultQuickAddDictionary,
    lastSelectedDictionary: config.session.lastSelectedDictionary,
    libraryPath: config.reader.libraryPath,
  } as unknown as AppConfiguration;
}

/** `config.json` (CONTEXT.md "App file"). A failed read runs the app on defaults, but they
 * are never saved over the file. */
const configFile = createAppFile<AppConfig>({
  fileName: 'config.json',
  what: 'Settings (config.json)',
  load: () => window.electronAPI.loadConfiguration(),
  save: (config) => window.electronAPI.saveConfiguration(toRaw(config)),
  parse: (data) => ({
    value: fromRaw(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
    dropped: 0,
  }),
  onUnreadable: 'defaults',
  defaults: () => fromRaw({}),
  saveError: 'Failed to save configuration',
});

export async function loadAppConfig(): Promise<AppConfig> {
  return (await configFile.read()).value;
}

/** Merges `patch` into the saved config, under the file's lock — callers give only the fields
 * they own. */
export function saveAppConfig(patch: {
  engine?: Partial<EngineConfig>;
  ui?: Partial<UIConfig>;
  session?: Partial<SessionConfig>;
  reader?: Partial<ReaderConfig>;
}): Promise<void> {
  return configFile.transform((current) => ({
    value: {
      engine: { ...current.engine, ...patch.engine },
      ui: { ...current.ui, ...patch.ui },
      session: { ...current.session, ...patch.session },
      reader: { ...current.reader, ...patch.reader },
    },
    result: undefined,
  }));
}

export function invalidateAppConfig(): void {
  configFile.invalidate();
}

/**
 * The seam for Tauri commands that write `config.json` directly (bypassing
 * saveAppConfig's read-modify-write — see the AppConfig entry in CONTEXT.md).
 * Serializes on the same lock as saveAppConfig so no plain config write can start
 * while a Rust-side write is in flight, calls `fn`, and invalidates the cache
 * immediately on success — before releasing the lock — so the very next queued
 * write (or the caller's own follow-up reads) never sees the pre-write cache.
 */
export function callRustConfigWrite<T extends { success: boolean }>(
  fn: () => Promise<T>
): Promise<T> {
  return configFile.writeExternally(fn);
}

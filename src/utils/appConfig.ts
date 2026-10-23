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
  /** Fingerprint of the book opened most recently — kept after Back, for the shelf's
   * "Continue reading" card. */
  lastBook: string | null;
  /** True while a book is on screen, cleared by Back. Quitting the app runs no Back (the
   * window closes without unmounting anything), so this still says "reading" at the next
   * launch, and the Reader reopens `lastBook`. */
  resumeOnLaunch: boolean;
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
      lastBook: typeof raw.lastBook === 'string' ? raw.lastBook : null,
      resumeOnLaunch: raw.resumeOnLaunch === true,
    },
  };
}

function toRaw(config: AppConfig): AppConfiguration {
  return {
    activeProperNouns: config.engine.activeProperNouns,
    defaultQuickAddDictionary: config.ui.defaultQuickAddDictionary,
    lastSelectedDictionary: config.session.lastSelectedDictionary,
    libraryPath: config.reader.libraryPath,
    lastBook: config.reader.lastBook,
    resumeOnLaunch: config.reader.resumeOnLaunch,
  } as unknown as AppConfiguration;
}

/** `config.json` (GLOSSARY.md "App file"). A failed read runs the app on defaults, but they
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

/** What the app runs on while `config.json` is unread or unreadable. */
export const DEFAULT_APP_CONFIG: AppConfig = fromRaw({});

/** The cached config, or `null` before the first successful load and between an invalidate and
 * the next load. Replaced, never mutated. A render-time reader subscribes with
 * `subscribeAppConfig` (`useAppConfig`); a handler reads with `loadAppConfig`. */
export function getAppConfigSnapshot(): AppConfig | null {
  return configFile.snapshot();
}

/**
 * The one write: once every write queued ahead of it has settled, `fn` gets the freshest
 * config and returns the next one plus a result for the caller. Returning `current`
 * unchanged saves nothing. Decide from `current`, not from an earlier `loadAppConfig`: a
 * write that lands between the read and the save is otherwise overwritten.
 */
export function transformAppConfig<R>(
  fn: (current: AppConfig) => { value: AppConfig; result: R }
): Promise<R> {
  return configFile.transform(fn);
}

/** Merges `patch` into the saved config, under the file's lock — callers give only the fields
 * they own. */
export function saveAppConfig(patch: {
  engine?: Partial<EngineConfig>;
  ui?: Partial<UIConfig>;
  session?: Partial<SessionConfig>;
  reader?: Partial<ReaderConfig>;
}): Promise<void> {
  return transformAppConfig((current) => ({
    value: {
      engine: { ...current.engine, ...patch.engine },
      ui: { ...current.ui, ...patch.ui },
      session: { ...current.session, ...patch.session },
      reader: { ...current.reader, ...patch.reader },
    },
    result: undefined,
  }));
}

/** Called after every change to the cached config: a load, a save, an invalidate. A component
 * that renders from the config reads it with `useAppConfig`, which subscribes through this. */
export function subscribeAppConfig(listener: () => void): () => void {
  return configFile.subscribe(listener);
}

export function invalidateAppConfig(): void {
  configFile.invalidate();
}

/**
 * The seam for Tauri commands that write `config.json` directly (bypassing
 * saveAppConfig's read-modify-write — see the AppConfig entry in GLOSSARY.md).
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

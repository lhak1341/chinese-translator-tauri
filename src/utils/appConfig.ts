import { validateApiResult } from './configValidation';
import { logger } from './logger';
import { reportQuarantine, unreadFileError } from './unreadableFile';
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

let cache: AppConfig | null = null;

// Serializes every config-disk write — plain saveAppConfig() calls and Rust-direct
// config.json writes (via callRustConfigWrite) alike — so a write started while another
// is still in flight queues instead of racing on the shared in-memory cache.
let configWriteQueue: Promise<unknown> = Promise.resolve();

function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = configWriteQueue.then(fn, fn);
  configWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

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

/** True from a failed read until a load succeeds. The app still runs on defaults then, but
 * they are never saved over the file (utils/unreadableFile.ts). */
let unread = false;

export async function loadAppConfig(): Promise<AppConfig> {
  if (cache) return cache;
  const rawResult = await window.electronAPI.loadConfiguration();
  const result = validateApiResult<Record<string, unknown>>(rawResult, 'loadConfiguration');
  if (!result.success) {
    // Defaults so the app can start, but uncached: the next load tries the file again.
    unread = true;
    logger.error('Could not read config.json; running on defaults:', result.error);
    return fromRaw({});
  }
  unread = false;
  reportQuarantine(rawResult, 'Settings (config.json)');
  cache = fromRaw(result.data ?? {});
  return cache;
}

export function saveAppConfig(patch: {
  engine?: Partial<EngineConfig>;
  ui?: Partial<UIConfig>;
  session?: Partial<SessionConfig>;
  reader?: Partial<ReaderConfig>;
}): Promise<void> {
  return withConfigLock(async () => {
    const current = cache ?? (await loadAppConfig());
    if (unread) throw unreadFileError('config.json');
    const merged: AppConfig = {
      engine: { ...current.engine, ...patch.engine },
      ui: { ...current.ui, ...patch.ui },
      session: { ...current.session, ...patch.session },
      reader: { ...current.reader, ...patch.reader },
    };
    const rawResult = await window.electronAPI.saveConfiguration(toRaw(merged));
    const result = validateApiResult(rawResult, 'saveConfiguration');
    if (!result.success) {
      throw new Error(result.error || 'Failed to save configuration');
    }
    cache = merged;
  });
}

export function invalidateAppConfig(): void {
  cache = null;
  unread = false;
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
  return withConfigLock(async () => {
    const result = await fn();
    if (result.success) {
      invalidateAppConfig();
    }
    return result;
  });
}

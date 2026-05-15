import { validateApiResult } from './configValidation';
import type { AppConfiguration } from '../types/ComponentTypes';

export interface EngineConfig {
  wasmEnabled: boolean;
  wasmMemoryLimit: number;
  activeProperNouns: string[];
}

export interface UIConfig {
  defaultQuickAddDictionary: string | null;
}

export interface SessionConfig {
  lastSelectedDictionary: string | null;
}

export interface AppConfig {
  engine: EngineConfig;
  ui: UIConfig;
  session: SessionConfig;
}

const ENGINE_DEFAULTS: EngineConfig = {
  wasmEnabled: true,
  wasmMemoryLimit: 20,
  activeProperNouns: ['properNouns'],
};

let cache: AppConfig | null = null;

function fromRaw(raw: Record<string, unknown>): AppConfig {
  return {
    engine: {
      wasmEnabled:
        typeof raw.wasmEnabled === 'boolean' ? raw.wasmEnabled : ENGINE_DEFAULTS.wasmEnabled,
      wasmMemoryLimit:
        typeof raw.wasmMemoryLimit === 'number' && raw.wasmMemoryLimit > 0
          ? raw.wasmMemoryLimit
          : ENGINE_DEFAULTS.wasmMemoryLimit,
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
  };
}

function toRaw(config: AppConfig): AppConfiguration {
  return {
    wasmEnabled: config.engine.wasmEnabled,
    wasmMemoryLimit: config.engine.wasmMemoryLimit,
    activeProperNouns: config.engine.activeProperNouns,
    defaultQuickAddDictionary: config.ui.defaultQuickAddDictionary,
    lastSelectedDictionary: config.session.lastSelectedDictionary,
  } as unknown as AppConfiguration;
}

export async function loadAppConfig(): Promise<AppConfig> {
  if (cache) return cache;
  const rawResult = await window.electronAPI.loadConfiguration();
  const result = validateApiResult<Record<string, unknown>>(rawResult, 'loadConfiguration');
  cache = fromRaw(result.success && result.data ? result.data : {});
  return cache;
}

export async function saveAppConfig(patch: {
  engine?: Partial<EngineConfig>;
  ui?: Partial<UIConfig>;
  session?: Partial<SessionConfig>;
}): Promise<void> {
  const current = cache ?? (await loadAppConfig());
  const merged: AppConfig = {
    engine: { ...current.engine, ...patch.engine },
    ui: { ...current.ui, ...patch.ui },
    session: { ...current.session, ...patch.session },
  };
  const rawResult = await window.electronAPI.saveConfiguration(toRaw(merged));
  const result = validateApiResult(rawResult, 'saveConfiguration');
  if (!result.success) {
    throw new Error(result.error || 'Failed to save configuration');
  }
  cache = merged;
}

export function invalidateAppConfig(): void {
  cache = null;
}

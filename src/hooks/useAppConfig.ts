import { useRef } from 'react';
import { DEFAULT_APP_CONFIG, appConfigFile, type AppConfig } from '../utils/appConfig';
import { useAppFile } from './useAppFile';

/**
 * The saved app config, for a component that renders from it (`useAppFile`).
 *
 * Between an invalidate (force reload, a Rust-side write) and the next load the cache is
 * empty; this serves the last config it saw, so a row does not blank for one round trip.
 * An unreadable `config.json` shows `DEFAULT_APP_CONFIG` and says nothing — a write is what
 * reports "Couldn't read config.json".
 */
export function useAppConfig(): { config: AppConfig; isLoading: boolean } {
  const { status, value } = useAppFile(appConfigFile);
  const lastSeenRef = useRef<AppConfig | null>(null);
  if (value !== null) lastSeenRef.current = value;

  const config = value ?? lastSeenRef.current ?? DEFAULT_APP_CONFIG;
  return { config, isLoading: status === 'unloaded' && lastSeenRef.current === null };
}

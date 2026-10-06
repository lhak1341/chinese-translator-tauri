import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_APP_CONFIG,
  getAppConfigSnapshot,
  loadAppConfig,
  subscribeAppConfig,
  type AppConfig,
} from '../utils/appConfig';

/**
 * The saved app config, for a component that renders from it. Follows every change the moment
 * it lands, whoever wrote it; starts a load if none has happened (every tab stays mounted, so
 * a read taken once at mount goes stale).
 *
 * Between an invalidate (force reload, a Rust-side write) and the next load the cache is
 * empty; this serves the last config it saw, so a row does not blank for one round trip.
 * An unreadable `config.json` shows `DEFAULT_APP_CONFIG` and says nothing — a write is what
 * reports "Couldn't read config.json".
 */
export function useAppConfig(): { config: AppConfig; isLoading: boolean } {
  const saved = useSyncExternalStore(subscribeAppConfig, getAppConfigSnapshot);
  const lastSeenRef = useRef<AppConfig | null>(null);
  if (saved !== null) lastSeenRef.current = saved;
  const [loadSettled, setLoadSettled] = useState(false);

  const isEmpty = saved === null;
  useEffect(() => {
    if (!isEmpty) return;
    let cancelled = false;
    loadAppConfig()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isEmpty]);

  const config = saved ?? lastSeenRef.current ?? DEFAULT_APP_CONFIG;
  return { config, isLoading: isEmpty && lastSeenRef.current === null && !loadSettled };
}

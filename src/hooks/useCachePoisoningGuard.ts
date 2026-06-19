import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';

interface CachePoisoningPayload {
  event_count: number;
  severity: 'warning' | 'critical';
  message: string;
  recommendation: string;
}

export interface PoisoningEvent {
  count: number;
  recommendation: string;
}

export interface CachePoisoningGuard {
  poisoning: PoisoningEvent | null;
  dismiss: () => void;
}

type ListenFn = typeof listen;

export function useCachePoisoningGuard(listenFn: ListenFn = listen): CachePoisoningGuard {
  const [poisoning, setPoisoning] = useState<PoisoningEvent | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const unsub = await listenFn<CachePoisoningPayload>(
          'dictionary-cache-critical-error',
          (event) => {
            if (!isMounted) return;

            logger.error('🚨 Dictionary cache critical error detected:', event.payload);

            const { event_count, message, recommendation } = event.payload;

            setPoisoning({ count: event_count || 0, recommendation: recommendation || '' });

            toast.error(`${message}\n\n${recommendation}`, {
              duration: TOAST_DURATIONS.ERROR,
              id: TOAST_IDS.CACHE_POISONING,
            });
          }
        );

        if (isMounted) {
          unsubscribe = unsub;
        } else {
          unsub();
        }
      } catch (error) {
        logger.error('Failed to set up cache poisoning event listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
    // listenFn captured at mount — stable by contract (module default or test mock)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { poisoning, dismiss: () => setPoisoning(null) };
}

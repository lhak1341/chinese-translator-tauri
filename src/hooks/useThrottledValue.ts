import { useState, useEffect } from 'react';

/**
 * Returns a copy of `value` that trails by `ms` milliseconds.
 * Cancels the pending update whenever `value` changes, preventing UI flooding
 * during rapid successive updates (e.g. streaming translation progress).
 */
export function useThrottledValue<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setThrottled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return throttled;
}

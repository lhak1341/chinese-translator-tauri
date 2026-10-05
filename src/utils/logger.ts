/**
 * Logger Utility
 *
 * Provides environment-aware logging with production safety:
 * - Development: Full logging with console.log/warn/error
 * - Production: Only warnings and errors, no debug logs
 *
 * Benefits:
 * - Reduces console pollution in production
 * - Improves performance (~0.1-0.5ms per log)
 * - Prevents exposing internal state to end users
 * - Maintains full debugging in development
 */

/** Log levels */
type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * Check if running in development mode
 */
const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

/** Emoji prefixes for each log level (hoisted to avoid per-call allocation) */
const LOG_PREFIXES: Record<LogLevel, string> = {
  log: '📝',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  debug: '🔍',
};

/**
 * Format log message with timestamp and emoji prefix
 */
const formatMessage = (level: LogLevel, ...args: unknown[]): unknown[] => {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');

  return [`[${h}:${m}:${s}] ${LOG_PREFIXES[level]}`, ...args];
};

/**
 * Logger class with environment-aware methods
 */
class Logger {
  /**
   * Debug log - only in development
   * Use for verbose debugging information
   */
  log(...args: unknown[]): void {
    if (isDevelopment()) {
      console.log(...formatMessage('log', ...args));
    }
  }

  /**
   * Info log - only in development
   * Use for informational messages
   */
  info(...args: unknown[]): void {
    if (isDevelopment()) {
      console.info(...formatMessage('info', ...args));
    }
  }

  /**
   * Debug log - only in development
   * Use for detailed debugging
   */
  debug(...args: unknown[]): void {
    if (isDevelopment()) {
      console.debug(...formatMessage('debug', ...args));
    }
  }

  /**
   * Warning log - always shown
   * Use for non-critical issues that should be visible in production
   */
  warn(...args: unknown[]): void {
    console.warn(...formatMessage('warn', ...args));
  }

  /**
   * Error log - always shown
   * Use for errors that should be visible in production
   */
  error(...args: unknown[]): void {
    console.error(...formatMessage('error', ...args));
  }

  /**
   * Grouped logs - only in development
   * Use for organizing related log statements
   */
  group(label: string): void {
    if (isDevelopment()) {
      console.group(`📦 ${label}`);
    }
  }

  groupCollapsed(label: string): void {
    if (isDevelopment()) {
      console.groupCollapsed(`📦 ${label}`);
    }
  }

  groupEnd(): void {
    if (isDevelopment()) {
      console.groupEnd();
    }
  }

  /**
   * Table log - only in development
   * Use for displaying tabular data
   */
  table(data: unknown): void {
    if (isDevelopment()) {
      console.table(data);
    }
  }

  /**
   * Performance timing - only in development
   */
  time(label: string): void {
    if (isDevelopment()) {
      console.time(`⏱️ ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (isDevelopment()) {
      console.timeEnd(`⏱️ ${label}`);
    }
  }

  /**
   * Debug-log an operation that exceeded a duration threshold (dev console only — a slow
   * dev build, with its unoptimised WASM, trips the default routinely).
   * @param operation - Operation name/description
   * @param startTime - `performance.now()` value captured at the operation's start
   * @param context - Additional context data for the log line
   * @param thresholdMs - Duration threshold in ms above which this logs (default 200)
   */
  debugIfSlow(
    operation: string,
    startTime: number,
    context: Record<string, unknown> = {},
    thresholdMs = 200
  ): void {
    const duration = performance.now() - startTime;
    if (duration > thresholdMs) {
      this.debug(`🐌 Slow operation detected: ${operation} took ${duration.toFixed(1)}ms`, {
        duration,
        context,
        threshold: thresholdMs,
      });
    }
  }
}

/**
 * Default logger instance
 * Use this throughout the application instead of console.*
 *
 * @example
 * ```ts
 * import { logger } from './utils/logger';
 *
 * // Development: logs to console
 * // Production: no output (improves performance)
 * logger.log('Translation started:', text);
 *
 * // Always shown (even in production)
 * logger.warn('Dictionary not found:', dictId);
 * logger.error('Failed to save:', error);
 * ```
 */
export const logger = new Logger();

export default logger;

/**
 * Unified Logging System
 *
 * Provides consistent logging across the entire translation system.
 * Replaces the current mix of:
 * - Direct console.log/warn/error calls
 * - this.debugEnabled boolean flags
 * - DEBUG_LEVELS enums
 * - process.env.NODE_ENV checks
 *
 * Benefits:
 * - Single configuration point for log verbosity
 * - Environment-aware log sampling (reduce production noise)
 * - Consistent log formatting with emojis and context
 * - Performance-conscious (minimal overhead in production)
 * - Easy to disable all logs or filter by category
 */

/**
 * Log levels in ascending order of severity
 */
export const LogLevel = {
  DEBUG: 0, // Detailed debugging info (development only)
  INFO: 1, // General information (startup, completion)
  WARN: 2, // Warnings (fallbacks, recoverable errors)
  ERROR: 3, // Errors (failures that don't crash)
  SILENT: 4, // No logging
} as const;

/**
 * Type for log level values
 */
export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Log categories for filtering
 */
export const LogCategory = {
  TRANSLATION: 'translation',
  DICTIONARY: 'dictionary',
  WASM: 'wasm',
  CACHE: 'cache',
  PERFORMANCE: 'performance',
  MEMORY: 'memory',
  UI: 'ui',
  PATTERN: 'pattern',
  POSITION: 'position',
  GENERAL: 'general',
} as const;

/**
 * Type for log category values
 */
export type LogCategoryValue = (typeof LogCategory)[keyof typeof LogCategory];

/**
 * Emoji prefixes for visual clarity
 */
const EMOJI_MAP: Record<LogCategoryValue, string> = {
  [LogCategory.TRANSLATION]: '🔄',
  [LogCategory.DICTIONARY]: '📚',
  [LogCategory.WASM]: '🦀',
  [LogCategory.CACHE]: '💾',
  [LogCategory.PERFORMANCE]: '⚡',
  [LogCategory.MEMORY]: '🧹',
  [LogCategory.UI]: '🎨',
  [LogCategory.PATTERN]: '🔍',
  [LogCategory.POSITION]: '📍',
  [LogCategory.GENERAL]: 'ℹ️',
};

/**
 * Log context for additional information
 */
export type LogContext = Record<string, any>;

/**
 * Logger statistics
 */
export interface LoggerStats {
  debug: number;
  info: number;
  warn: number;
  error: number;
  sampled: number; // Number of logs skipped due to sampling
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level to display */
  minLevel?: LogLevelValue;

  /** Categories to enable logging for */
  enabledCategories?: LogCategoryValue[];

  /** Sampling rate for high-frequency logs (0.0-1.0) */
  samplingRate?: number;
}

/**
 * Global logging configuration
 */
export interface LoggingConfig {
  /** Minimum log level */
  minLevel?: LogLevelValue;

  /** Enabled log categories */
  enabledCategories?: LogCategoryValue[];

  /** Sampling rate for high-frequency logs */
  samplingRate?: number;
}

/**
 * Unified Logger Class
 */
export class UnifiedLogger {
  private name: string;
  private enabled: boolean;
  private minLevel: LogLevelValue;
  private enabledCategories: LogCategoryValue[];
  private samplingRate: number;
  private stats: LoggerStats;

  constructor(name: string, options: LoggerOptions = {}) {
    this.name = name;
    this.enabled = true;

    // Configuration
    this.minLevel = options.minLevel ?? this.getDefaultLogLevel();
    this.enabledCategories = options.enabledCategories ?? Object.values(LogCategory);
    this.samplingRate = options.samplingRate ?? 1.0; // 0.0-1.0, for high-frequency logs

    // Statistics
    this.stats = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      sampled: 0,
    };
  }

  /**
   * Get default log level based on environment
   */
  private getDefaultLogLevel(): LogLevelValue {
    if (process.env.NODE_ENV === 'development') {
      return LogLevel.DEBUG;
    } else if (process.env.NODE_ENV === 'test') {
      return LogLevel.ERROR;
    } else {
      return LogLevel.WARN;
    }
  }

  /**
   * Check if should log based on level, category, and sampling
   */
  private shouldLog(level: LogLevelValue, category: LogCategoryValue): boolean {
    if (!this.enabled) return false;
    if (level < this.minLevel) return false;
    if (!this.enabledCategories.includes(category)) return false;

    // Apply sampling for DEBUG and INFO levels to reduce noise
    if ((level === LogLevel.DEBUG || level === LogLevel.INFO) && this.samplingRate < 1.0) {
      if (Math.random() > this.samplingRate) {
        this.stats.sampled++;
        return false;
      }
    }

    return true;
  }

  /**
   * Format log message with context
   */
  private formatMessage(
    level: LogLevelValue,
    category: LogCategoryValue,
    message: string,
    context?: LogContext
  ): string {
    const emoji = EMOJI_MAP[category] || '📝';
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm

    let prefix = `${emoji} [${this.name}]`;

    // Add timestamp in development for debugging
    if (process.env.NODE_ENV === 'development') {
      prefix = `${timestamp} ${prefix}`;
    }

    // Format context if provided
    let contextStr = '';
    if (context && Object.keys(context).length > 0) {
      const parts = Object.entries(context).map(([key, value]) => {
        // Truncate long strings
        if (typeof value === 'string' && value.length > 50) {
          return `${key}=${value.substring(0, 50)}...`;
        }
        return `${key}=${value}`;
      });
      contextStr = ` (${parts.join(', ')})`;
    }

    return `${prefix} ${message}${contextStr}`;
  }

  /**
   * Log at DEBUG level
   */
  debug(category: LogCategoryValue, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(LogLevel.DEBUG, category)) return;

    this.stats.debug++;
    console.debug(this.formatMessage(LogLevel.DEBUG, category, message, context));
  }

  /**
   * Log at INFO level
   */
  info(category: LogCategoryValue, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(LogLevel.INFO, category)) return;

    this.stats.info++;
    console.log(this.formatMessage(LogLevel.INFO, category, message, context));
  }

  /**
   * Log at WARN level
   */
  warn(category: LogCategoryValue, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(LogLevel.WARN, category)) return;

    this.stats.warn++;
    console.warn(this.formatMessage(LogLevel.WARN, category, message, context));
  }

  /**
   * Log at ERROR level
   */
  error(
    category: LogCategoryValue,
    message: string,
    context: LogContext = {},
    error: Error | null = null
  ): void {
    if (!this.shouldLog(LogLevel.ERROR, category)) return;

    this.stats.error++;
    const formattedMessage = this.formatMessage(LogLevel.ERROR, category, message, context);

    if (error) {
      console.error(formattedMessage, error);
    } else {
      console.error(formattedMessage);
    }
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevelValue): void {
    this.minLevel = level;
  }

  /**
   * Enable/disable specific categories
   */
  setCategories(categories: LogCategoryValue[]): void {
    this.enabledCategories = categories;
  }

  /**
   * Set sampling rate for high-frequency logs
   */
  setSamplingRate(rate: number): void {
    this.samplingRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Enable or disable all logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get logging statistics
   */
  getStats(): LoggerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      sampled: 0,
    };
  }
}

/**
 * Global logger instance for general use
 */
export const globalLogger = new UnifiedLogger('System');

/**
 * Create a scoped logger for a specific module
 *
 * @param moduleName - Name of the module (e.g., 'TranslationEngine', 'WasmAccelerator')
 * @param options - Logger configuration options
 * @returns Scoped logger instance
 *
 * @example
 * ```ts
 * const logger = createLogger('TranslationEngine');
 * logger.info(LogCategory.TRANSLATION, 'Starting translation', { textLength: 1000 });
 * logger.warn(LogCategory.CACHE, 'Cache miss', { key: 'some-key' });
 * ```
 */
export function createLogger(moduleName: string, options: LoggerOptions = {}): UnifiedLogger {
  return new UnifiedLogger(moduleName, options);
}

/**
 * Configure global logging settings
 *
 * @param config - Global logging configuration
 *
 * @example
 * ```ts
 * // Production: only show warnings and errors
 * configureLogging({
 *   minLevel: LogLevel.WARN,
 *   samplingRate: 0.1
 * });
 * ```
 *
 * @example
 * ```ts
 * // Development: show everything except performance logs
 * configureLogging({
 *   minLevel: LogLevel.DEBUG,
 *   enabledCategories: [
 *     LogCategory.TRANSLATION,
 *     LogCategory.DICTIONARY,
 *     LogCategory.WASM
 *   ]
 * });
 * ```
 */
export function configureLogging(config: LoggingConfig): void {
  if (config.minLevel !== undefined) {
    globalLogger.setLevel(config.minLevel);
  }
  if (config.enabledCategories !== undefined) {
    globalLogger.setCategories(config.enabledCategories);
  }
  if (config.samplingRate !== undefined) {
    globalLogger.setSamplingRate(config.samplingRate);
  }
}

/**
 * Convenience functions for quick logging without creating logger instance
 */
export const log = {
  debug: (category: LogCategoryValue, message: string, context?: LogContext) =>
    globalLogger.debug(category, message, context),
  info: (category: LogCategoryValue, message: string, context?: LogContext) =>
    globalLogger.info(category, message, context),
  warn: (category: LogCategoryValue, message: string, context?: LogContext) =>
    globalLogger.warn(category, message, context),
  error: (
    category: LogCategoryValue,
    message: string,
    context?: LogContext,
    error?: Error | null
  ) => globalLogger.error(category, message, context, error),
};

// Export for debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).unifiedLogger = globalLogger;
  (window as any).configureLogging = configureLogging;
}

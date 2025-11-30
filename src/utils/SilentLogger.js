/**
 * Silent Logger - Ultra-fast no-op logging for performance
 * Replaces verbose logging systems during critical performance operations
 */

export class SilentLogger {
  static log() {
    // No-op: do absolutely nothing for maximum performance
  }
  
  static info() {
    // No-op
  }
  
  static debug() {
    // No-op
  }
  
  static verbose() {
    // No-op
  }
  
  static warn(message, ...args) {
    // Only show actual warnings
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️', message, ...args);
    }
  }
  
  static error(message, ...args) {
    // Always show errors
    console.error('🚨', message, ...args);
  }
}

// Export convenience methods for drop-in replacement
export const silentLog = {
  log: SilentLogger.log,
  info: SilentLogger.info,
  debug: SilentLogger.debug,
  verbose: SilentLogger.verbose,
  warn: SilentLogger.warn,
  error: SilentLogger.error
};
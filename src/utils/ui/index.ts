/**
 * UI feedback utilities public API — only what other modules import through the barrel.
 * Everything else in this directory is imported from its own file.
 *
 * Primary entry points:
 *   - DebouncedProgressHandler  — batch progress callbacks during streaming translation
 *   - adaptiveBufferCalculator  — optimal virtual scroll buffer sizing
 */

export { DebouncedProgressHandler } from './UIResponsiveness';
export { adaptiveBufferCalculator } from './AdaptiveVirtualScrolling';

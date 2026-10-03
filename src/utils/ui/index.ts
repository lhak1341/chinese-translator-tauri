/**
 * UI feedback utilities public API — only what other modules import through the barrel.
 * Everything else in this directory is imported from its own file.
 *
 * Primary entry points:
 *   - DebouncedProgressHandler  — batch progress callbacks during streaming translation
 */

export { DebouncedProgressHandler } from './UIResponsiveness';

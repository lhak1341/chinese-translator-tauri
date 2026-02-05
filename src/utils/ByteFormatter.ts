/**
 * Byte Formatting Utilities
 *
 * Pure utility functions for formatting byte values with appropriate units.
 * Extracted from TranslationEngine.js and other files (Priority 1 extraction).
 *
 * WHY EXTRACTABLE:
 * - Pure functions with zero `this.*` references
 * - No side effects or state modification
 * - Takes all data as parameters
 * - Returns transformed string
 * - Reusable across the entire application
 *
 * USAGE:
 * ```typescript
 * import { formatBytes, formatBytesToMB, formatBytesToKB } from './ByteFormatter.js';
 *
 * console.log(formatBytes(1536)); // "1.50 KB"
 * console.log(formatBytes(1048576)); // "1.00 MB"
 * console.log(formatBytes(1073741824)); // "1.00 GB"
 *
 * console.log(formatBytesToMB(1048576)); // "1.0MB"
 * console.log(formatBytesToMB(1048576, 2)); // "1.00MB"
 * ```
 */

/**
 * Byte unit type
 */
export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB';

/** Binary base (hoisted to avoid per-call constant) */
const K = 1024;

/** Unit labels in order of magnitude (hoisted to avoid per-call allocation) */
const BYTE_UNITS: ByteUnit[] = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Format bytes to megabytes with specified decimal places
 *
 * @param bytes - Byte count to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "1.5MB")
 *
 * @example
 * formatBytesToMB(1048576) // "1.0MB"
 * formatBytesToMB(1572864) // "1.5MB"
 * formatBytesToMB(1048576, 2) // "1.00MB"
 */
export function formatBytesToMB(bytes: number, decimals: number = 1): string {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0.0MB';
  }

  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(decimals)}MB`;
}

/**
 * Format bytes to kilobytes with specified decimal places
 *
 * @param bytes - Byte count to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "1.5KB")
 *
 * @example
 * formatBytesToKB(1024) // "1.0KB"
 * formatBytesToKB(1536) // "1.5KB"
 * formatBytesToKB(1024, 2) // "1.00KB"
 */
export function formatBytesToKB(bytes: number, decimals: number = 1): string {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0.0KB';
  }

  const kb = bytes / 1024;
  return `${kb.toFixed(decimals)}KB`;
}

/**
 * Format bytes to gigabytes with specified decimal places
 *
 * @param bytes - Byte count to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.50GB")
 *
 * @example
 * formatBytesToGB(1073741824) // "1.00GB"
 * formatBytesToGB(1610612736) // "1.50GB"
 */
export function formatBytesToGB(bytes: number, decimals: number = 2): string {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0.00GB';
  }

  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(decimals)}GB`;
}

/**
 * Format bytes with automatic unit selection
 * Selects the most appropriate unit (KB, MB, GB) based on magnitude
 *
 * @param bytes - Byte count to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with automatic unit (e.g., "1.50 KB")
 *
 * @example
 * formatBytes(500) // "500 B"
 * formatBytes(1536) // "1.50 KB"
 * formatBytes(1048576) // "1.00 MB"
 * formatBytes(1073741824) // "1.00 GB"
 * formatBytes(1536, 1) // "1.5 KB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0 B';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const dm = decimals < 0 ? 0 : decimals;

  const i = Math.floor(Math.log(bytes) / Math.log(K));
  const sizeIndex = Math.min(i, BYTE_UNITS.length - 1);

  return `${parseFloat((bytes / Math.pow(K, sizeIndex)).toFixed(dm))} ${BYTE_UNITS[sizeIndex]}`;
}

/**
 * Format bytes with compact notation (no space between value and unit)
 * Same as formatBytes but removes space for compact display
 *
 * @param bytes - Byte count to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with compact unit (e.g., "1.50KB")
 *
 * @example
 * formatBytesCompact(1536) // "1.50KB"
 * formatBytesCompact(1048576) // "1.00MB"
 */
export function formatBytesCompact(bytes: number, decimals: number = 2): string {
  return formatBytes(bytes, decimals).replace(' ', '');
}

/**
 * Parse formatted byte string back to number
 * Supports KB, MB, GB, TB suffixes (case-insensitive, with or without space)
 *
 * @param formattedBytes - Formatted byte string (e.g., "1.5 MB", "1.5MB")
 * @returns Byte count, or 0 if parsing fails
 *
 * @example
 * parseFormattedBytes("1.5 KB") // 1536
 * parseFormattedBytes("1 MB") // 1048576
 * parseFormattedBytes("1.5MB") // 1572864 (no space)
 * parseFormattedBytes("invalid") // 0
 */
export function parseFormattedBytes(formattedBytes: string): number {
  if (typeof formattedBytes !== 'string') {
    return 0;
  }

  // Match number and optional unit (with or without space)
  const match = formattedBytes.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase() as ByteUnit;

  const multipliers: Record<ByteUnit, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}

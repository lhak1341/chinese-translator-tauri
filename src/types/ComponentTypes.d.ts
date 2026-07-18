/**
 * Common component prop types shared across the application
 *
 * This file provides centralized type definitions for component props,
 * enabling type safety for both .tsx and .jsx components (via JSDoc imports).
 *
 * Usage in .jsx files:
 * @typedef {import('./types/ComponentTypes').TabId} TabId
 * @param {TabId} tab
 */

// =============================================================================
// Tab Navigation Types
// =============================================================================

/**
 * Valid tab identifiers for the main application interface
 */
export type TabId = 'translator' | 'dictionary' | 'configuration' | 'appearance';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Dictionary metadata information
 */
export interface DictionaryInfo {
  /** Unique identifier for the dictionary */
  id: string;
  /** Human-readable name */
  name: string;
  /** File system path to dictionary JSON */
  path: string;
  /** Whether this dictionary is currently active */
  isActive: boolean;
  /** Number of entries in the dictionary */
  entryCount?: number;
  /** Dictionary type (characters, phrases, patterns, etc.) */
  type?: 'characters' | 'phrases' | 'patterns' | 'properNouns' | 'conversion' | 'punctuation';
  /** Last modified timestamp */
  lastModified?: string;
  /** File size in bytes */
  fileSize?: number;
}

/**
 * Dictionary type definition with validation
 */
export interface DictionaryTypeDefinition {
  /** Dictionary identifier */
  id: string;
  /** Display label */
  label: string;
  /** Description of the dictionary's purpose */
  description: string;
  /** Dictionary data (can be null for lazy-loaded dictionaries) */
  data: any;
  /** Validation function for dictionary entries */
  validate: (source: string, translation: string) => string | null;
}

/**
 * Collection of all dictionary type definitions
 */
export interface DictionaryTypesCollection {
  [key: string]: DictionaryTypeDefinition;
}

/**
 * Application configuration object
 */
export interface AppConfiguration {
  /** List of active proper noun dictionary IDs */
  activeProperNouns: string[];
  /** Whether WASM acceleration is enabled */
  wasmEnabled: boolean;
  /** WASM memory limit in MB */
  wasmMemoryLimit: number;
  /** Default dictionary for Cmd-5 quick add */
  defaultQuickAddDictionary?: string | null;
  /** Last selected dictionary ID */
  lastSelectedDictionary?: string;
  /** Auto-save configuration changes */
  autoSaveEnabled?: boolean;
  /** Enable debug mode logging */
  debugMode?: boolean;
  /** Enable two-phase pattern processing */
  enableTwoPhasePatterns?: boolean;
  /** Enable streaming translation */
  enableStreaming?: boolean;
  /** Chunk size for batch processing */
  chunkSize?: number;
  /** Maximum concurrent operations */
  maxConcurrency?: number;
}

// =============================================================================
// Appearance Types
// =============================================================================

/**
 * Letter spacing options
 */
export type LetterSpacing = 'normal' | 'tight' | 'wide';

/**
 * Font settings for a text area
 */
export interface FontSettings {
  /** Font family name */
  fontFamily: string;
  /** Font size (CSS value, e.g., '1rem', '14px') */
  fontSize: string;
  /** Letter spacing setting */
  letterSpacing: LetterSpacing;
  /** Line height (optional, CSS value) */
  lineHeight?: string;
  /** Font weight (optional, CSS value) */
  fontWeight?: string | number;
  /** Paragraph spacing (optional, CSS value for margin-bottom, e.g., '1rem', '16px') */
  paragraphSpacing?: string;
}

/**
 * Theme options
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * Complete appearance settings for the application
 */
export interface AppearanceSettings {
  /** Font settings for Chinese/original text */
  chineseText: FontSettings;
  /** Font settings for full translation */
  fullTranslation: FontSettings;
  /** Font settings for character-only translation */
  characterOnly: FontSettings;
  /** Font family for UI elements */
  uiFont: Pick<FontSettings, 'fontFamily'>;
  /** Theme selection */
  theme: Theme;
  /** Whether Character Only Box follows Full Translation Box style */
  characterOnlyFollowsFullTranslation?: boolean;
  /** Custom CSS variables (optional) */
  customColors?: Record<string, string>;
}

// =============================================================================
// Export all types as a namespace for convenience
// =============================================================================

export {};

/**
 * AsyncInitializer - Manages asynchronous initialization with race condition prevention
 *
 * REFACTOR (2026-01-28): Provides reusable pattern for WASM/async resource initialization.
 * Eliminates duplicate promise caching and race condition handling across WASM processors.
 *
 * Handles common patterns:
 * - Promise caching (prevents multiple concurrent initializations)
 * - Failed state tracking (prevents retry after permanent failure)
 * - State cleanup on failure
 * - Type-safe result handling
 *
 * @example
 * // Module-level usage (functional style)
 * const initializer = new AsyncInitializer<WasmModule>('WASM Pattern Processor');
 *
 * export async function initializeWasm() {
 *   return initializer.initialize(async () => {
 *     const module = await import('../wasm/module.js');
 *     await module.default();
 *     return module;
 *   });
 * }
 *
 * export function getWasm() {
 *   return initializer.getResource();
 * }
 *
 * @example
 * // Class usage (instance style)
 * class WasmManager {
 *   private initializer = new AsyncInitializer<Engine>('WASM Engine');
 *
 *   async initialize() {
 *     const engine = await this.initializer.initialize(async () => {
 *       return await createEngine();
 *     });
 *     return engine !== null;
 *   }
 *
 *   isInitialized() {
 *     return this.initializer.isInitialized();
 *   }
 * }
 */

import { logger } from './logger';

export class AsyncInitializer<T> {
  private name: string;
  private initializationPromise: Promise<T | null> | null = null;
  private initializationFailed: boolean = false;
  private resource: T | null = null;

  /**
   * Create a new AsyncInitializer
   *
   * @param name - Human-readable name for logging (e.g., "WASM Pattern Processor")
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Initialize resource with race condition prevention
   *
   * Returns cached result if already initialized or failed.
   * Returns existing promise if initialization in progress.
   * Caches promise synchronously before async work to prevent race conditions.
   *
   * @param initFunction - Async function that initializes and returns the resource
   * @param cleanupOnFailure - Optional cleanup function called if initialization fails
   * @returns {Promise<T | null>} Initialized resource, or null if initialization failed
   *
   * @example
   * const wasmModule = await initializer.initialize(async () => {
   *   const module = await import('../wasm/core.js');
   *   await module.default();
   *   const instance = new module.WasmProcessor();
   *   instance.configure({ bufferSize: 1024 });
   *   return instance;
   * });
   *
   * if (wasmModule === null) {
   *   console.error('Initialization failed, using fallback');
   * }
   */
  async initialize(
    initFunction: () => Promise<T>,
    cleanupOnFailure?: () => void
  ): Promise<T | null> {
    // Return cached result if already initialized
    if (this.resource !== null) {
      return this.resource;
    }

    // Return null if previous initialization failed
    if (this.initializationFailed) {
      return null;
    }

    // Return existing promise if initialization in progress
    if (this.initializationPromise !== null) {
      return this.initializationPromise;
    }

    // RACE CONDITION FIX: Assign promise synchronously before async work
    // This prevents concurrent calls from creating multiple initialization attempts
    return (this.initializationPromise = (async () => {
      try {
        logger.log(`Initializing ${this.name}...`);

        const resource = await initFunction();

        this.resource = resource;
        logger.log(`✅ ${this.name} initialized successfully`);

        return resource;
      } catch (error) {
        logger.error(`❌ ${this.name} initialization failed:`, error);

        this.initializationFailed = true;
        this.initializationPromise = null; // Allow retry by clearing promise
        this.resource = null;

        // Call cleanup if provided
        if (cleanupOnFailure) {
          try {
            cleanupOnFailure();
          } catch (cleanupError) {
            logger.error(`${this.name} cleanup failed:`, cleanupError);
          }
        }

        return null;
      }
    })());
  }

  /**
   * Check if resource is initialized
   *
   * @returns {boolean} True if resource is initialized and available
   */
  isInitialized(): boolean {
    return this.resource !== null;
  }

  /**
   * Check if initialization has failed
   *
   * @returns {boolean} True if initialization was attempted and failed
   */
  hasFailed(): boolean {
    return this.initializationFailed;
  }

  /**
   * Check if initialization is in progress
   *
   * @returns {boolean} True if initialization promise exists but hasn't completed
   */
  isInitializing(): boolean {
    return this.initializationPromise !== null && this.resource === null;
  }

  /**
   * Get initialized resource (or null if not initialized)
   *
   * @returns {T | null} The initialized resource, or null
   */
  getResource(): T | null {
    return this.resource;
  }

  /**
   * Get initialization status summary
   *
   * @returns Status object with state details
   */
  getStatus() {
    return {
      name: this.name,
      initialized: this.isInitialized(),
      failed: this.hasFailed(),
      initializing: this.isInitializing(),
    };
  }

  /**
   * Reset initialization state (for testing or recovery)
   *
   * WARNING: Clears all state including cached resource.
   * Use with caution - may cause resource leaks if not properly cleaned up first.
   *
   * @param cleanup - Optional cleanup function called before reset
   */
  reset(cleanup?: (resource: T) => void): void {
    if (cleanup && this.resource !== null) {
      try {
        cleanup(this.resource);
      } catch (error) {
        logger.error(`${this.name} reset cleanup failed:`, error);
      }
    }

    this.initializationPromise = null;
    this.initializationFailed = false;
    this.resource = null;

    logger.log(`${this.name} state reset`);
  }
}

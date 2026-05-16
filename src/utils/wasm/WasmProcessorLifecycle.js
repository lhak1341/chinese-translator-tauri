// @ts-check
/**
 * Shared initialization lifecycle for WASM processors.
 *
 * Owns the invariant sequence every WASM processor must run before its instance is
 * usable: binary fetch → SHA-256 integrity verification → instantiateFn(binary) →
 * instance method verification. Wraps the sequence in exponential-backoff retry
 * (transient errors only) and tracks init state.
 *
 * Each WASM processor holds one WasmProcessorLifecycle instance. The processor
 * provides an instantiateFn that receives the verified binary and returns the
 * configured WASM instance. Domain-specific setup (e.g., loading pattern
 * dictionaries into the instance) happens inside instantiateFn before it returns.
 * Runtime error handling (toasts, fallback mode) stays in the processor module.
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md
 */

import { logger } from '../logger';
import { wasmRetryManager } from './WasmRetryManager';
import { fetchWasmBinary } from './wasmBinaryCache';
import { verifyWasmBinaryIntegrity, verifyWasmInstance } from './wasmIntegrityVerifier';

const RETRY_COOLDOWN_MS = 5000;

export class WasmProcessorLifecycle {
  /**
   * @param {{
   *   name: string,
   *   wasmFileName: string,
   *   wasmBinaryUrl: URL,
   *   expectedMethods: string[]
   * }} config
   * wasmBinaryUrl MUST be created with a static string literal so Vite can
   * transform the asset URL for production builds.
   */
  constructor({ name, wasmFileName, wasmBinaryUrl, expectedMethods }) {
    this.name = name;
    this._wasmFileName = wasmFileName;
    this._wasmBinaryUrl = wasmBinaryUrl;
    this._expectedMethods = expectedMethods;
    this._isReady = false;
    this._hasFailed = false;
    /** @type {Promise<boolean>|null} */
    this._initializationPromise = null;
    this._retryAllowedAfter = 0;
    this._failureCount = 0;
  }

  get isReady() {
    return this._isReady;
  }

  get hasFailed() {
    return this._hasFailed;
  }

  /** The in-progress initialization promise, or null. Use to await a concurrent init. */
  get pendingInit() {
    return this._initializationPromise;
  }

  /**
   * Run the init sequence: fetch binary → verify integrity → instantiateFn(binary)
   * → verify instance methods. Retries on transient failures with exponential backoff.
   * Idempotent: returns true immediately if already ready.
   *
   * instantiateFn receives the verified ArrayBuffer and must return the initialized
   * WASM instance. It owns: module loading, module-level structural verification,
   * instance construction, and any domain-specific post-init (e.g. pattern loading).
   *
   * @param {function(ArrayBuffer): Promise<Object>} instantiateFn
   * @returns {Promise<boolean>}
   */
  async initialize(instantiateFn) {
    if (this._isReady) return true;
    if (this._hasFailed) return false;

    if (this._retryAllowedAfter > Date.now()) {
      const remaining = Math.ceil((this._retryAllowedAfter - Date.now()) / 1000);
      logger.warn(`⏳ ${this.name} initialization on cooldown (${remaining}s remaining)`);
      return false;
    }

    if (this._initializationPromise) return this._initializationPromise;

    return (this._initializationPromise = (async () => {
      try {
        await wasmRetryManager.retryWithBackoff(
          async () => {
            logger.debug(`Fetching WASM binary for ${this.name} integrity verification...`);
            const wasmBinary = await fetchWasmBinary(this._wasmBinaryUrl);
            logger.debug(`${this.name} WASM binary ready (${wasmBinary.byteLength} bytes)`);

            const integrityCheck =
              /** @type {{ valid: boolean, errors: string[], warnings: string[] }} */ (
                await verifyWasmBinaryIntegrity(this._wasmFileName, wasmBinary)
              );
            if (!integrityCheck.valid) {
              throw new Error(
                `WASM binary integrity check failed: ${integrityCheck.errors.join(', ')}`
              );
            }
            if (integrityCheck.warnings.length > 0) {
              logger.warn(`${this.name} WASM integrity warnings:`, integrityCheck.warnings);
            }

            const instance = await instantiateFn(wasmBinary);

            const instanceVerification = /** @type {{ valid: boolean, errors: string[] }} */ (
              verifyWasmInstance(instance, this._expectedMethods, this.name)
            );
            if (!instanceVerification.valid) {
              throw new Error(
                `WASM instance verification failed: ${instanceVerification.errors.join(', ')}`
              );
            }
          },
          `${this.name}-init`,
          { onlyRetryTransient: true }
        );

        this._isReady = true;
        return true;
      } catch (error) {
        logger.error(`❌ Failed to initialize ${this.name} after retries:`, error);
        this._hasFailed = true;
        this._failureCount++;
        this._retryAllowedAfter = Date.now() + RETRY_COOLDOWN_MS;
        this._initializationPromise = null;
        return false;
      }
    })());
  }

  /**
   * Reset lifecycle state to allow re-initialization. Returns false (and logs) if
   * still within the post-failure cooldown window — caller must not proceed.
   * @returns {boolean}
   */
  reset() {
    if (this._retryAllowedAfter > Date.now()) {
      const remaining = Math.ceil((this._retryAllowedAfter - Date.now()) / 1000);
      logger.warn(`⏳ ${this.name} reset blocked — cooldown ${remaining}s remaining`);
      return false;
    }
    this._isReady = false;
    this._hasFailed = false;
    this._initializationPromise = null;
    this._retryAllowedAfter = 0;
    return true;
  }

  /**
   * @returns {{ name: string, isReady: boolean, hasFailed: boolean, failureCount: number, inCooldown: boolean }}
   */
  getStatus() {
    return {
      name: this.name,
      isReady: this._isReady,
      hasFailed: this._hasFailed,
      failureCount: this._failureCount,
      inCooldown: this._retryAllowedAfter > Date.now(),
    };
  }
}

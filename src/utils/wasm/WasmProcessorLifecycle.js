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
import { fetchWasmBinary } from './wasmBinaryCache';
import { verifyWasmBinaryIntegrity, verifyWasmInstance } from './wasmIntegrityVerifier';

const RETRY_COOLDOWN_MS = 5000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

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
        await this._retryWithBackoff(async () => {
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
        }, `${this.name}-init`);

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

  /**
   * @param {Error} error
   * @returns {boolean}
   */
  _isTransientError(error) {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('memory') ||
      message.includes('allocation') ||
      message.includes('busy') ||
      message.includes('locked') ||
      message.includes('unavailable') ||
      (message.includes('serialization') && !message.includes('format'))
    );
  }

  /**
   * @param {number} attempt 0-indexed attempt number
   * @returns {number} delay in ms
   */
  _calculateDelay(attempt) {
    const exp = BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = exp * 0.25 * (Math.random() * 2 - 1);
    return Math.min(Math.floor(exp + jitter), MAX_DELAY_MS);
  }

  /**
   * Retry an async operation with exponential backoff (transient errors only).
   * @param {Function} operation
   * @param {string} context
   * @returns {Promise<any>}
   */
  async _retryWithBackoff(operation, context) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          logger.log(
            `✅ WASM ${context} succeeded after ${attempt} ${attempt === 1 ? 'retry' : 'retries'}`
          );
        }
        return result;
      } catch (/** @type {any} */ error) {
        lastError = error;
        const isLast = attempt === MAX_RETRIES - 1;

        if (!this._isTransientError(error)) {
          logger.warn(
            `⚠️ WASM ${context} failed with non-transient error, not retrying:`,
            error.message
          );
          throw error;
        }

        if (isLast) {
          logger.error(`❌ WASM ${context} failed after ${MAX_RETRIES} attempts:`, error.message);
          throw error;
        }

        const delay = this._calculateDelay(attempt);
        logger.log(
          `🔄 WASM ${context} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`
        );
        logger.log(`   Error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}

/**
 * Structural check of an initialized WASM instance.
 *
 * The generated JS glue and the binary come from one wasm-pack build, so they only drift when
 * one is stale; a wrapper expecting a method the binary lacks then fails here, at init, instead
 * of at the first call. File-level hashing of the binary was removed 2026-10-06 (ADR-080).
 */

import { logger } from '../logger';

/**
 * Verify a WASM class instance has every expected method.
 *
 * Strict on purpose (ADR-080 addendum): it was once lenient for test mocks and passed with a
 * single method present, which let a stale binary through init. A test supplies an instance
 * with the wrapper's real method set.
 *
 * @param {Object} instance - The WASM class instance
 * @param {string[]} expectedMethods - Array of method names that must exist
 * @param {string} instanceName - Instance name for error messages
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyWasmInstance(instance, expectedMethods, instanceName) {
  if (!instance) {
    const errors = [`Instance ${instanceName} is null or undefined`];
    logger.error(`❌ WASM instance ${instanceName} validation failed:`, errors);
    return { valid: false, errors };
  }

  const errors = expectedMethods
    .filter((methodName) => typeof instance[methodName] !== 'function')
    .map((methodName) => `Method not found on ${instanceName}: ${methodName}`);

  if (errors.length > 0) {
    logger.error(`❌ WASM instance ${instanceName} validation failed:`, errors);
    return { valid: false, errors };
  }

  logger.log(
    `✅ WASM instance ${instanceName} has ${expectedMethods.length}/${expectedMethods.length} expected methods`
  );
  return { valid: true, errors };
}

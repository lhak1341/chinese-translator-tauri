// @ts-check
/**
 * Shared cascade-retire registry for everything that holds the one WASM binary: the
 * wrapper(s) and the shared loader (`WasmSharedModule.js`).
 *
 * Any WASM panic permanently corrupts the shared dlmalloc allocator. Each holder
 * registers a retire callback here at module load time; when any wrapper's catch
 * block fires, it calls fireCascadeRetire() to retire all of them atomically.
 *
 * This file has NO imports from any wrapper so it can be imported by all wrappers
 * without creating circular dependencies.
 */

/** @type {Array<() => void>} */
const _handlers = [];

/**
 * Register a callback that retires this wrapper when any sibling WASM panic fires.
 * Called once at module load time by each holder of the shared binary.
 * @param {() => void} fn
 */
export function registerCascadeHandler(fn) {
  _handlers.push(fn);
}

/**
 * Retire all registered WASM wrappers. Idempotent — safe to call multiple times.
 * Called from every WASM panic catch block before returning to the caller.
 */
export function fireCascadeRetire() {
  for (const fn of _handlers) {
    try {
      fn();
    } catch (_) {
      // retire callbacks must never propagate — a throw here would mask the original panic
    }
  }
}

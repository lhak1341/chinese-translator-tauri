import type { TranslationEngine as EngineClass } from '../utils/TranslationEngine';
import type { TranslationEngine } from './TranslationEngineTypes';

/**
 * Compile-time only. `TranslationEngine.js` is JavaScript and `checkJs` is off, so nothing
 * else checks the hand-written `TranslationEngine` interface against the class: it once
 * declared five methods the class did not have. `tsc` infers the class's members from the
 * JS, so declaring one the class lacks fails here.
 *
 * Names only, not signatures: the class's JSDoc says `Promise<Object>` where the interface
 * says `Promise<TranslationResult>`, and checking that would mean rewriting the class's
 * JSDoc to satisfy it.
 */
type AssertTrue<T extends true> = T;

export type EngineInterfaceMembersExistOnTheClass = AssertTrue<
  keyof TranslationEngine extends keyof EngineClass ? true : false
>;

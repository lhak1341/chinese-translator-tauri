/**
 * Generic utility types for common patterns
 *
 * Provides reusable type helpers for recursive operations, async handling,
 * functional programming, branded types, and object constraint types.
 *
 * Usage:
 * @typedef {import('./types/UtilityTypes').DeepPartial<MyType>} PartialMyType
 * @typedef {import('./types/UtilityTypes').Result<Data, Error>} MyResult
 */

// =============================================================================
// Recursive Types
// =============================================================================

/**
 * Makes all properties in T optional recursively
 *
 * @example
 * type Config = {
 *   database: {
 *     host: string;
 *     port: number;
 *   };
 * };
 * type PartialConfig = DeepPartial<Config>;
 * // { database?: { host?: string; port?: number } }
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Makes all properties in T readonly recursively
 *
 * @example
 * type Config = {
 *   settings: {
 *     theme: string;
 *   };
 * };
 * type ImmutableConfig = DeepReadonly<Config>;
 * // { readonly settings: { readonly theme: string } }
 */
export type DeepReadonly<T> = T extends object
  ? {
      readonly [P in keyof T]: DeepReadonly<T[P]>;
    }
  : T;

/**
 * Makes all properties in T required recursively
 */
export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]-?: DeepRequired<T[P]>;
    }
  : T;

// =============================================================================
// Promise Types
// =============================================================================

/**
 * Extracts the resolved type from a Promise
 *
 * @example
 * type Data = UnwrapPromise<Promise<string>>; // string
 * type Nested = UnwrapPromise<Promise<Promise<number>>>; // number
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

/**
 * Wraps a type in a Promise if not already a Promise
 */
export type Awaitable<T> = T | Promise<T>;

/**
 * Extracts all promise types from a tuple
 */
export type UnwrapPromiseTuple<T extends readonly unknown[]> = {
  [K in keyof T]: UnwrapPromise<T[K]>;
};

// =============================================================================
// Function Types
// =============================================================================

/**
 * Generic async function type
 */
export type AsyncFunction<TArgs extends any[] = any[], TReturn = any> = (
  ...args: TArgs
) => Promise<TReturn>;

/**
 * Generic callback function type
 */
export type Callback<TArgs extends any[] = any[], TReturn = void> = (...args: TArgs) => TReturn;

/**
 * Generic async callback function type
 */
export type AsyncCallback<TArgs extends any[] = any[], TReturn = any> = Callback<
  TArgs,
  Promise<TReturn>
>;

/**
 * No-argument function
 */
export type VoidFunction = () => void;

/**
 * No-argument async function
 */
export type AsyncVoidFunction = () => Promise<void>;

// =============================================================================
// Result Types
// =============================================================================

/**
 * Represents a successful result
 */
export interface Ok<T> {
  success: true;
  data: T;
  error?: never;
}

/**
 * Represents a failed result
 */
export interface Err<E = Error> {
  success: false;
  data?: never;
  error: E;
}

/**
 * Result type for operations that can succeed or fail
 *
 * @example
 * async function loadFile(): Promise<Result<string, Error>> {
 *   try {
 *     const data = await readFile('config.json');
 *     return { success: true, data };
 *   } catch (error) {
 *     return { success: false, error: error as Error };
 *   }
 * }
 *
 * const result = await loadFile();
 * if (result.success) {
 *   console.log(result.data); // string
 * } else {
 *   console.error(result.error); // Error
 * }
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Represents an optional value
 *
 * @example
 * function findUser(id: string): Option<User> {
 *   const user = users.find(u => u.id === id);
 *   return user ?? null;
 * }
 */
export type Option<T> = T | null | undefined;

/**
 * Makes a type nullable
 */
export type Nullable<T> = T | null;

/**
 * Makes a type optional (undefined allowed)
 */
export type Maybe<T> = T | undefined;

// =============================================================================
// Function Helpers
// =============================================================================

/**
 * Predicate function that tests a value
 *
 * @example
 * const isPositive: Predicate<number> = (n) => n > 0;
 * const numbers = [-1, 0, 1, 2];
 * const positive = numbers.filter(isPositive); // [1, 2]
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Async predicate function
 */
export type AsyncPredicate<T> = (value: T) => Promise<boolean>;

/**
 * Comparator function for sorting
 *
 * @example
 * const byLength: Comparator<string> = (a, b) => a.length - b.length;
 * const words = ['cat', 'elephant', 'dog'];
 * words.sort(byLength); // ['cat', 'dog', 'elephant']
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Mapper function that transforms a value
 *
 * @example
 * const toUpperCase: Mapper<string, string> = (s) => s.toUpperCase();
 * const names = ['alice', 'bob'];
 * const upper = names.map(toUpperCase); // ['ALICE', 'BOB']
 */
export type Mapper<T, U> = (value: T) => U;

/**
 * Async mapper function
 */
export type AsyncMapper<T, U> = (value: T) => Promise<U>;

/**
 * Reducer function for aggregation
 *
 * @example
 * const sum: Reducer<number, number> = (acc, val) => acc + val;
 * const numbers = [1, 2, 3, 4];
 * const total = numbers.reduce(sum, 0); // 10
 */
export type Reducer<T, U> = (accumulator: U, value: T) => U;

/**
 * Async reducer function
 */
export type AsyncReducer<T, U> = (accumulator: U, value: T) => Promise<U>;

/**
 * Consumer function that uses a value without returning
 */
export type Consumer<T> = (value: T) => void;

/**
 * Async consumer function
 */
export type AsyncConsumer<T> = (value: T) => Promise<void>;

/**
 * Supplier function that produces a value
 */
export type Supplier<T> = () => T;

/**
 * Async supplier function
 */
export type AsyncSupplier<T> = () => Promise<T>;

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Creates a branded type for nominal typing
 *
 * @example
 * type UserId = Brand<'UserId', string>;
 * type ProductId = Brand<'ProductId', string>;
 *
 * function getUser(id: UserId): User { ... }
 * function getProduct(id: ProductId): Product { ... }
 *
 * const userId = 'user-123' as UserId;
 * const productId = 'prod-456' as ProductId;
 *
 * getUser(userId); // OK
 * getUser(productId); // Type error!
 */
export type Brand<K, T> = T & { __brand: K };

/**
 * Dictionary identifier (branded string)
 */
export type DictionaryId = Brand<'DictionaryId', string>;

/**
 * Translation identifier (branded string)
 */
export type TranslationId = Brand<'TranslationId', string>;

/**
 * Session identifier (branded string)
 */
export type SessionId = Brand<'SessionId', string>;

/**
 * Cache key (branded string)
 */
export type CacheKey = Brand<'CacheKey', string>;

/**
 * Timestamp (branded number)
 */
export type Timestamp = Brand<'Timestamp', number>;

// =============================================================================
// Constraint Types
// =============================================================================

/**
 * Requires at least one property from T
 *
 * @example
 * type SearchParams = RequireAtLeastOne<{
 *   name?: string;
 *   email?: string;
 *   phone?: string;
 * }>;
 *
 * const valid: SearchParams = { name: 'Alice' }; // OK
 * const invalid: SearchParams = {}; // Type error!
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/**
 * Requires exactly one property from T
 *
 * @example
 * type ID = RequireOnlyOne<{
 *   userId?: string;
 *   email?: string;
 *   phone?: string;
 * }>;
 *
 * const valid: ID = { email: 'test@example.com' }; // OK
 * const invalid: ID = { userId: '123', email: 'test@example.com' }; // Type error!
 */
export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

/**
 * Makes specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Omits properties by value type
 */
export type OmitByType<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K];
};

/**
 * Picks properties by value type
 */
export type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

// =============================================================================
// Object Utility Types
// =============================================================================

/**
 * Makes all properties mutable (removes readonly)
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Creates a type with all values of T
 */
export type ValueOf<T> = T[keyof T];

/**
 * Creates a union of all nested property paths
 */
export type Paths<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? K | `${K}.${Paths<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

/**
 * Gets the type of a nested property by path
 */
export type PathValue<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? PathValue<T[K], R>
      : never
    : never;

/**
 * Creates a strict object type that doesn't allow extra properties
 */
export type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;

// =============================================================================
// Array Utility Types
// =============================================================================

/**
 * Gets the element type of an array
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Creates a tuple of length N filled with type T
 */
export type Tuple<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleOf<T, N, []>
  : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N
  ? R
  : _TupleOf<T, N, [T, ...R]>;

/**
 * Creates a readonly tuple from a mutable tuple
 */
export type ReadonlyTuple<T extends readonly any[]> = readonly [...T];

// =============================================================================
// Export all types
// =============================================================================

export {};

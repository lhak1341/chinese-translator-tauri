/**
 * Result Helper Utilities
 *
 * `ApiResult` is the canonical type for Tauri API responses, used by `configValidation.ts`.
 */

/**
 * ElectronAPI result structure
 */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

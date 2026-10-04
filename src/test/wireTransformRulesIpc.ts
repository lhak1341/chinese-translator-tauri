import { invalidateTransformRules } from '../utils/dictionary/TransformRuleBackend';
import type { TransformRule } from '../types/TransformRuleTypes';

/**
 * Wires backend-shaped stubs in at the Transform Rules IPC, so the real backend (the App
 * file's cache, lock and commit queue) runs between them and the code under test. For tests
 * that seed `{ rules, droppedCount }` per case and assert on what was saved; a test that just
 * wants a working disk uses `installFakeAppFile` instead.
 *
 * `droppedCount` becomes that many invalid items in the loaded data, which the backend's
 * parser drops and counts. `save` is optional: without it a save simply succeeds.
 */
export function wireTransformRulesIpc(stubs: {
  load: () => Promise<{ rules: TransformRule[]; droppedCount: number }>;
  save?: (rules: TransformRule[]) => Promise<unknown>;
}): void {
  invalidateTransformRules();
  const api = (window.electronAPI ?? {}) as unknown as Record<string, unknown>;
  window.electronAPI = Object.assign(api, {
    loadTransformRules: async () => {
      const { rules, droppedCount } = await stubs.load();
      return { success: true, data: [...rules, ...Array(droppedCount).fill({ junk: true })] };
    },
    saveTransformRules: async (rules: TransformRule[]) => {
      await stubs.save?.(rules);
      return { success: true };
    },
  }) as unknown as typeof window.electronAPI;
}

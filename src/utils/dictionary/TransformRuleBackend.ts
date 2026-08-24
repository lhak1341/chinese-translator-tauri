import type { TransformRule } from '../../types/TransformRuleTypes';

let cache: TransformRule[] | null = null;

/** Pre-2026-08-24 persisted rules stored the relocate flag as `moveWords: number`
 * (0/1, occasionally a legacy literal word count from before 2026-08-15 — see
 * CONTEXT.md's "Transform Rule" entry). Coerce it to `relocate: boolean` on load so
 * every in-memory rule uses the current field regardless of when it was saved. */
function migrateLegacyMoveWords(raw: TransformRule[]): TransformRule[] {
  return raw.map((rule) => {
    const legacy = rule as TransformRule & { moveWords?: number };
    if (legacy.moveWords === undefined) return rule;
    const { moveWords, ...rest } = legacy;
    return { ...rest, relocate: Boolean(moveWords) };
  });
}

export async function loadTransformRules(): Promise<TransformRule[]> {
  if (cache) return cache;
  const result = await window.electronAPI.loadTransformRules();
  cache = result.success && result.data ? migrateLegacyMoveWords(result.data) : [];
  return cache;
}

export async function saveTransformRules(rules: TransformRule[]): Promise<void> {
  const result = await window.electronAPI.saveTransformRules(rules);
  if (!result.success) {
    throw new Error(result.error || 'Failed to save transform rules');
  }
  cache = rules;
}

export function invalidateTransformRules(): void {
  cache = null;
}

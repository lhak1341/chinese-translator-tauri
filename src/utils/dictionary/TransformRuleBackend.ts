import type { TransformRule } from '../../types/TransformRuleTypes';

let cache: TransformRule[] | null = null;

export async function loadTransformRules(): Promise<TransformRule[]> {
  if (cache) return cache;
  const result = await window.electronAPI.loadTransformRules();
  cache = result.success && result.data ? result.data : [];
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

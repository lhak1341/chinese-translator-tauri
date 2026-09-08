import type { TransformRule } from '../../types/TransformRuleTypes';
import { validateApiResult } from '../configValidation';
import { validateTransformRule } from './TransformRuleValidation';
import { logger } from '../logger';

let cache: TransformRule[] | null = null;

/** Pre-2026-08-24 persisted rules stored the relocate flag as `moveWords: number`
 * (0/1, occasionally a legacy literal word count from before 2026-08-15 — see
 * CONTEXT.md's "Transform Rule" entry). Coerce it to `relocate: boolean` on load so
 * every in-memory rule uses the current field regardless of when it was saved. Runs
 * on unvalidated raw data — BEFORE `validateTransformRule`, which checks the current
 * `relocate: boolean` shape only. */
function migrateLegacyMoveWords(raw: unknown[]): unknown[] {
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const legacy = item as Record<string, unknown> & { moveWords?: number };
    if (legacy.moveWords === undefined) return item;
    const { moveWords, ...rest } = legacy;
    return { ...rest, relocate: Boolean(moveWords) };
  });
}

export interface LoadTransformRulesResult {
  rules: TransformRule[];
  droppedCount: number;
}

export async function loadTransformRules(): Promise<LoadTransformRulesResult> {
  if (cache) return { rules: cache, droppedCount: 0 };
  const rawResult = await window.electronAPI.loadTransformRules();
  const result = validateApiResult<unknown>(rawResult, 'loadTransformRules');
  const rawList = result.success && Array.isArray(result.data) ? result.data : [];
  const migrated = migrateLegacyMoveWords(rawList);

  const rules: TransformRule[] = [];
  let droppedCount = 0;
  for (const item of migrated) {
    const rule = validateTransformRule(item);
    if (rule) {
      rules.push(rule);
    } else {
      droppedCount++;
    }
  }
  if (droppedCount > 0) {
    logger.warn(`loadTransformRules: dropped ${droppedCount} invalid rule(s)`);
  }

  cache = rules;
  return { rules, droppedCount };
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

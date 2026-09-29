import type { TransformRule } from '../../types/TransformRuleTypes';
import { validateTransformRule } from './TransformRuleValidation';
import { createAppFile } from '../appFile';

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

/** Migrated, then validated; an item that fails validation is dropped and counted. */
function parseRules(data: unknown): { value: TransformRule[]; dropped: number } {
  const migrated = migrateLegacyMoveWords(Array.isArray(data) ? data : []);
  const value: TransformRule[] = [];
  for (const item of migrated) {
    const rule = validateTransformRule(item);
    if (rule) value.push(rule);
  }
  return { value, dropped: migrated.length - value.length };
}

/** `transform-rules.json` (CONTEXT.md "App file"). A failed read throws: saving then would
 * replace every rule on disk with what this session made. */
const rulesFile = createAppFile<TransformRule[]>({
  fileName: 'transform-rules.json',
  what: 'Transform Rules (transform-rules.json)',
  load: () => window.electronAPI.loadTransformRules(),
  save: (rules) => window.electronAPI.saveTransformRules(rules),
  parse: parseRules,
  onUnreadable: 'throw',
  saveError: 'Failed to save transform rules',
});

export interface LoadTransformRulesResult {
  rules: TransformRule[];
  droppedCount: number;
}

export async function loadTransformRules(): Promise<LoadTransformRulesResult> {
  const { value, dropped } = await rulesFile.read();
  return { rules: value, droppedCount: dropped };
}

/** Replaces every saved rule, under the file's lock. */
export function saveTransformRules(rules: TransformRule[]): Promise<void> {
  return rulesFile.transform(() => ({ value: rules, result: undefined }));
}

export function invalidateTransformRules(): void {
  rulesFile.invalidate();
}

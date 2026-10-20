import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { TransformRule } from '../types/TransformRuleTypes';
import {
  commitRuleChange,
  getTransformRulesSnapshot,
  loadTransformRules,
  subscribeTransformRules,
  type RuleChange,
} from '../utils/dictionary/TransformRuleBackend';
import { findConflict } from '../utils/dictionary/TransformRuleEngine';
import toast from '../utils/toast';

export function generateTransformRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function conflictError(
  rule: Pick<TransformRule, 'matchKind' | 'key'>,
  conflict: TransformRule
): Error {
  return new Error(
    `A ${rule.matchKind} rule for "${rule.key}" already exists (${conflict.label || conflict.key})`
  );
}

/** Throws if another rule in `current` already has `rule`'s (matchKind, key). */
function assertNoConflict(current: TransformRule[], rule: TransformRule): void {
  const conflict = findConflict(current, rule);
  if (conflict) throw conflictError(rule, conflict);
}

interface PendingChange {
  id: number;
  change: RuleChange;
}

/** `rules` with every pending change applied that still applies — what the UI shows. */
function withPending(rules: TransformRule[], pending: PendingChange[]): TransformRule[] {
  return pending.reduce((current, { change }) => {
    try {
      return change(current);
    } catch {
      return current; // it will fail at its turn and drop out; show it as not there
    }
  }, rules);
}

const NO_RULES: TransformRule[] = [];

/**
 * The saved Transform Rules, read-only — what the Add form seeds from (CONTEXT.md "Transform
 * Rule"). Reads the backend's cache, so it follows every save the moment it lands. Starts a
 * load if none has happened; says nothing about a failed one — the Rules tab's editor does.
 */
export function useTransformRules(): { rules: TransformRule[]; isLoading: boolean } {
  const saved = useSyncExternalStore(subscribeTransformRules, getTransformRulesSnapshot);
  const [loadSettled, setLoadSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTransformRules()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rules: saved ?? NO_RULES, isLoading: saved === null && !loadSettled };
}

/**
 * The Rules tab's changes to the Transform Rules — the only writer.
 *
 * Each change is committed through the backend (`commitRuleChange`), which saves one at a time
 * against the rules that last saved. `rules` shows the saved rules with every pending change
 * applied, so an edit appears at once. A change is checked for conflicts when it is made, for
 * the immediate error, and again at its turn.
 */
export function useTransformRuleEditor() {
  const { rules: saved, isLoading } = useTransformRules();
  const [pending, setPending] = useState<PendingChange[]>([]);

  // Mirrors `pending` in the same breath as state: a change made before the next render must
  // see the one made just before it.
  const pendingRef = useRef<PendingChange[]>([]);
  const nextIdRef = useRef(0);

  const setPendingChanges = useCallback((next: PendingChange[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  // Load problems are reported here, once — the Rules tab is always mounted.
  useEffect(() => {
    let cancelled = false;
    loadTransformRules()
      .then(({ droppedCount }) => {
        if (!cancelled && droppedCount > 0) {
          toast.warning(`${droppedCount} rule(s) skipped — invalid data`);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Saves stay refused until a load succeeds (TransformRuleBackend), so say why the
        // list is empty rather than let an edit fail with no context.
        toast.error(`Could not load Transform Rules: ${(error as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rules = useMemo(() => withPending(saved, pending), [saved, pending]);

  /** Commit `change`. Rejects at once on a conflict with what the UI shows; otherwise
   * resolves or rejects when its turn has saved or failed. */
  const submit = useCallback(
    async (change: RuleChange): Promise<void> => {
      try {
        // The backend's cache, not the rendered `saved`: a save that just landed is in it
        // before React re-renders.
        change(withPending(getTransformRulesSnapshot() ?? NO_RULES, pendingRef.current));
      } catch (error) {
        toast.error((error as Error).message);
        throw error;
      }
      const id = nextIdRef.current++;
      setPendingChanges([...pendingRef.current, { id, change }]);
      let conflictAtTurn = false;
      try {
        await commitRuleChange((current) => {
          try {
            return change(current);
          } catch (error) {
            conflictAtTurn = true;
            throw error;
          }
        });
      } catch (error) {
        toast.error(
          conflictAtTurn ? (error as Error).message : 'Failed to save rule changes — reverted.'
        );
        throw error;
      } finally {
        setPendingChanges(pendingRef.current.filter((p) => p.id !== id));
      }
    },
    [setPendingChanges]
  );

  const checkConflict = useCallback(
    (candidate: Pick<TransformRule, 'id' | 'matchKind' | 'key'>) => findConflict(rules, candidate),
    [rules]
  );

  const addRule = useCallback(
    async (rule: Omit<TransformRule, 'id'>): Promise<TransformRule> => {
      const newRule: TransformRule = { ...rule, id: generateTransformRuleId() };
      await submit((current) => {
        assertNoConflict(current, newRule);
        return [...current, newRule];
      });
      return newRule;
    },
    [submit]
  );

  const updateRule = useCallback(
    (rule: TransformRule): Promise<void> =>
      submit((current) => {
        assertNoConflict(current, rule);
        return current.map((r) => (r.id === rule.id ? rule : r));
      }),
    [submit]
  );

  const deleteRule = useCallback(
    (id: string): Promise<void> => submit((current) => current.filter((r) => r.id !== id)),
    [submit]
  );

  const toggleEnabled = useCallback(
    (id: string): Promise<void> =>
      submit((current) => current.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))),
    [submit]
  );

  return {
    rules,
    isLoading,
    checkConflict,
    addRule,
    updateRule,
    deleteRule,
    toggleEnabled,
  };
}

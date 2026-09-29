import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TransformRule } from '../types/TransformRuleTypes';
import { loadTransformRules, saveTransformRules } from '../utils/dictionary/TransformRuleBackend';
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

/** One change to the rule list: computed from the rules it is applied to, and throwing when
 * that list makes it invalid (a conflict). */
type RuleChange = (rules: TransformRule[]) => TransformRule[];

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

/**
 * The Transform Rules list, and the changes the Rules tab makes to it.
 *
 * Changes are saved one at a time, in the order they were made. Each runs at its turn
 * against the rules that last saved successfully — never against another change still in
 * flight — so a failed save drops only its own change, and the changes queued behind it
 * re-run without it. `rules` shows the saved rules with every pending change applied, so an
 * edit appears at once. A change is checked for conflicts when it is made, for the
 * immediate error, and again at its turn.
 *
 * Only the Rules tab's instance writes. The Add form's instance only reads, through the
 * backend cache, which updates when a save succeeds — so an Add opened during a save seeds
 * from the rules before it (CONTEXT.md "Transform Rule").
 */
export function useTransformRules() {
  const [saved, setSaved] = useState<TransformRule[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs mirror both, updated in the same breath as state: a change made before the next
  // render must see the one made just before it.
  const savedRef = useRef<TransformRule[]>([]);
  const pendingRef = useRef<PendingChange[]>([]);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const nextIdRef = useRef(0);

  const setSavedRules = useCallback((next: TransformRule[]) => {
    savedRef.current = next;
    setSaved(next);
  }, []);
  const setPendingChanges = useCallback((next: PendingChange[]) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTransformRules()
      .then(({ rules: loaded, droppedCount }) => {
        if (!cancelled) {
          setSavedRules(loaded);
          if (droppedCount > 0) {
            toast.warning(`${droppedCount} rule(s) skipped — invalid data`);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setSavedRules]);

  const rules = useMemo(() => withPending(saved, pending), [saved, pending]);

  /** Queue `change`. Rejects at once on a conflict with what the UI shows; otherwise
   * resolves or rejects when its turn has saved or failed. */
  const submit = useCallback(
    (change: RuleChange): Promise<void> => {
      try {
        change(withPending(savedRef.current, pendingRef.current));
      } catch (error) {
        toast.error((error as Error).message);
        return Promise.reject(error);
      }
      const id = nextIdRef.current++;
      setPendingChanges([...pendingRef.current, { id, change }]);
      const drop = () => setPendingChanges(pendingRef.current.filter((p) => p.id !== id));

      const turn = queueRef.current.then(async () => {
        let next: TransformRule[];
        try {
          next = change(savedRef.current);
        } catch (error) {
          drop();
          toast.error((error as Error).message);
          throw error;
        }
        try {
          await saveTransformRules(next);
        } catch (error) {
          drop();
          toast.error('Failed to save rule changes — reverted.');
          throw error;
        }
        setSavedRules(next);
        drop();
      });
      queueRef.current = turn.catch(() => undefined);
      return turn;
    },
    [setPendingChanges, setSavedRules]
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

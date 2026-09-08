import { useCallback, useEffect, useState } from 'react';
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

export function useTransformRules() {
  const [rules, setRules] = useState<TransformRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadTransformRules()
      .then(({ rules: loaded, droppedCount }) => {
        if (!cancelled) {
          setRules(loaded);
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
  }, []);

  const persist = useCallback(
    async (next: TransformRule[]) => {
      const previous = rules;
      setRules(next);
      try {
        await saveTransformRules(next);
      } catch (err) {
        setRules(previous);
        toast.error('Failed to save rule changes — reverted.');
        throw err;
      }
    },
    [rules]
  );

  const checkConflict = useCallback(
    (candidate: Pick<TransformRule, 'id' | 'matchKind' | 'key'>) => findConflict(rules, candidate),
    [rules]
  );

  const addRule = useCallback(
    async (rule: Omit<TransformRule, 'id'>): Promise<TransformRule> => {
      const newRule: TransformRule = { ...rule, id: generateTransformRuleId() };
      const conflict = findConflict(rules, newRule);
      if (conflict) {
        const error = conflictError(newRule, conflict);
        toast.error(error.message);
        throw error;
      }
      await persist([...rules, newRule]);
      return newRule;
    },
    [rules, persist]
  );

  const updateRule = useCallback(
    async (rule: TransformRule): Promise<void> => {
      const conflict = findConflict(rules, rule);
      if (conflict) {
        const error = conflictError(rule, conflict);
        toast.error(error.message);
        throw error;
      }
      await persist(rules.map((r) => (r.id === rule.id ? rule : r)));
    },
    [rules, persist]
  );

  const deleteRule = useCallback(
    async (id: string): Promise<void> => {
      await persist(rules.filter((r) => r.id !== id));
    },
    [rules, persist]
  );

  const toggleEnabled = useCallback(
    async (id: string): Promise<void> => {
      await persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    },
    [rules, persist]
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

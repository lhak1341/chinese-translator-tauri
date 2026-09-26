import {
  hasPairedPatterns,
  isProperNounsDict,
  tierOf,
  toPatternsId,
} from './DictionaryIdClassifier';
import { loadAppConfig } from '../appConfig';
import { logger } from '../logger';

/**
 * Which dictionary Cmd-5 (proper noun) and Cmd-6 (structural pattern) add to — one rule for
 * the Translator modal, the Dictionary tab, and the Reader. See CONTEXT.md "Quick-add target".
 *
 * The rule reads a **quick-add view**, not config directly. The Translator and Dictionary tab
 * pass config as loaded; the Reader passes config as the open book's binding implies it
 * (`readerQuickAddView` in utils/reader/ReaderQuickAddTarget.ts). Pure: callers own the config
 * read (`loadQuickAddConfig`) and what to do with the answer (open a modal, switch a table).
 */

export type QuickAddKind = 'properNoun' | 'structuralPattern';

/** The two config fields the rule reads. `null` when config could not be loaded. */
export interface QuickAddView {
  defaultQuickAddDictionary: string | null;
  activeProperNouns: string[];
}

export type QuickAddTarget =
  | { kind: 'open'; dictionaryId: string }
  | { kind: 'none'; reason: 'pairMissing'; patternsId: string };

/** Fallback order when the default is unusable. Root is never picked here — it is the last
 * resort after this list comes up empty. Cmd-6 ranks only the paired tiers (custom has no
 * patterns half), so for it the order is fiction → generic. */
const TIER_RANK = { fiction: 0, custom: 1, generic: 2 } as const;

function firstByTier(activeProperNouns: readonly string[]): string | undefined {
  return activeProperNouns
    .filter((id) => isProperNounsDict(id) && tierOf(id) !== 'root')
    .sort((a, b) => {
      const rank =
        TIER_RANK[tierOf(a) as keyof typeof TIER_RANK] -
        TIER_RANK[tierOf(b) as keyof typeof TIER_RANK];
      return rank !== 0 ? rank : a.localeCompare(b);
    })[0];
}

export function quickAddTarget(
  kind: QuickAddKind,
  view: QuickAddView | null,
  dictionaries: { [key: string]: unknown }
): QuickAddTarget {
  const def = view?.defaultQuickAddDictionary;
  const defActive = def && view.activeProperNouns.includes(def) ? def : undefined;

  if (kind === 'properNoun') {
    return {
      kind: 'open',
      dictionaryId: defActive ?? (view && firstByTier(view.activeProperNouns)) ?? 'properNouns',
    };
  }

  // Cmd-6 mirrors Cmd-5 (ADR-048): an active default names its own patterns half — root
  // `patterns` for root `properNouns` — while a default with no pair (custom), or no usable
  // default, falls to the first active paired dictionary by tier, then to root `patterns`.
  const owner =
    defActive && (defActive === 'properNouns' || hasPairedPatterns(defActive))
      ? defActive
      : view && firstByTier(view.activeProperNouns.filter(hasPairedPatterns));
  if (!owner || owner === 'properNouns') return { kind: 'open', dictionaryId: 'patterns' };
  // The pair is created atomically (ADR-027), so a missing patterns file means someone
  // deleted half a pair by hand — a repair to report, not something to route around.
  const patternsId = toPatternsId(owner);
  return dictionaries[patternsId] !== undefined
    ? { kind: 'open', dictionaryId: patternsId }
    : { kind: 'none', reason: 'pairMissing', patternsId };
}

/** What to tell the user when Cmd-6 has nowhere to go. */
export function quickAddMissMessage(miss: Extract<QuickAddTarget, { kind: 'none' }>): string {
  return `The structural pattern dictionary ${miss.patternsId} is missing`;
}

/** Loads the quick-add view from config. Logs and returns `null` on failure — every caller
 * then decides with no config (Cmd-5 falls to `properNouns`, Cmd-6 to `patterns`). */
export async function loadQuickAddConfig(): Promise<QuickAddView | null> {
  try {
    const config = await loadAppConfig();
    return {
      defaultQuickAddDictionary: config.ui.defaultQuickAddDictionary ?? null,
      activeProperNouns: config.engine.activeProperNouns,
    };
  } catch (cause) {
    logger.error('Failed to load config for a quick-add:', cause);
    return null;
  }
}

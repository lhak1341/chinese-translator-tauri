import {
  hasPairedPatterns,
  isPairedPatternsId,
  isProperNounsDict,
  tierOf,
  toPatternsId,
  toProperNounsId,
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

/** Orders non-root proper-nouns ids by `TIER_RANK`, alphabetically within a tier. */
function byTier(a: string, b: string): number {
  const rank =
    TIER_RANK[tierOf(a) as keyof typeof TIER_RANK] - TIER_RANK[tierOf(b) as keyof typeof TIER_RANK];
  return rank !== 0 ? rank : a.localeCompare(b);
}

function firstByTier(activeProperNouns: readonly string[]): string | undefined {
  return activeProperNouns
    .filter((id) => isProperNounsDict(id) && tierOf(id) !== 'root')
    .sort(byTier)[0];
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

/**
 * The **quick-add choices**: which of `dictionaryIds` the Add form's dropdown offers, decided
 * over the same view as the target, so the dropdown can never offer a dictionary the target
 * rule would not consider active (the Reader's stale-config case). A proper-nouns dictionary
 * is a choice while the view has it active, a paired patterns dictionary while its
 * proper-nouns half is, and every other kind always. `opened` — the dictionary the form
 * opened on — is always a choice, so a fallback target (root `properNouns` over an empty
 * view) is never missing from its own dropdown. Keeps `dictionaryIds`' order.
 */
export function quickAddChoices(
  view: QuickAddView | null,
  dictionaryIds: readonly string[],
  opened: string
): string[] {
  const active = view?.activeProperNouns ?? [];
  return dictionaryIds.filter((id) => {
    if (id === opened) return true;
    if (isPairedPatternsId(id)) return active.includes(toProperNounsId(id));
    return !isProperNounsDict(id) || active.includes(id);
  });
}

/** The dictionaries a Cmd-3 or Cmd-4 Add can switch between without the dropdown. */
export interface QuickAddShortlist {
  kind: QuickAddKind;
  ids: string[];
}

/**
 * The **quick-add shortlist** for Cmd-3 (`properNoun`) and Cmd-4 (`structuralPattern`): the
 * root dictionary first, then every active custom and generic proper-nouns dictionary, by
 * tier. Fiction is left out — Cmd-5/Cmd-6 already reach it. For `structuralPattern` each entry
 * is the patterns half, so a custom dictionary (no pair) drops out, and so does a pair whose
 * patterns file is not loaded (the Cmd-6 `pairMissing` case). Decided over the same view as
 * `quickAddChoices`, so every shortlist entry is also a dropdown choice.
 */
export function quickAddShortlist(
  kind: QuickAddKind,
  view: QuickAddView | null,
  dictionaries: { [key: string]: unknown }
): QuickAddShortlist {
  const nonFiction = [...new Set(view?.activeProperNouns ?? [])]
    .filter((id) => isProperNounsDict(id) && tierOf(id) !== 'root' && tierOf(id) !== 'fiction')
    .sort(byTier);
  if (kind === 'properNoun') return { kind, ids: ['properNouns', ...nonFiction] };
  const patternsIds = nonFiction
    .filter(hasPairedPatterns)
    .map(toPatternsId)
    .filter((id) => dictionaries[id] !== undefined);
  return { kind, ids: ['patterns', ...patternsIds] };
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

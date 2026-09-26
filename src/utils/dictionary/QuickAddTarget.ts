import {
  isFictionProperNounsId,
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

export type QuickAddMissReason = 'noFiction' | 'pairMissing';

export type QuickAddTarget =
  | { kind: 'open'; dictionaryId: string }
  | { kind: 'none'; reason: QuickAddMissReason; patternsId?: string };

/** Fallback order for Cmd-5 when the default is unusable. Root is never picked here — it is
 * the last resort after this list comes up empty. */
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

function activeFiction(view: QuickAddView): string | undefined {
  const { defaultQuickAddDictionary: def, activeProperNouns } = view;
  if (def && isFictionProperNounsId(def)) return def;
  return activeProperNouns.filter(isFictionProperNounsId).sort()[0];
}

export function quickAddTarget(
  kind: QuickAddKind,
  view: QuickAddView | null,
  dictionaries: { [key: string]: unknown }
): QuickAddTarget {
  if (kind === 'properNoun') {
    const def = view?.defaultQuickAddDictionary;
    if (def && view.activeProperNouns.includes(def)) return { kind: 'open', dictionaryId: def };
    return {
      kind: 'open',
      dictionaryId: (view && firstByTier(view.activeProperNouns)) ?? 'properNouns',
    };
  }

  const fiction = view ? activeFiction(view) : undefined;
  if (!fiction) return { kind: 'none', reason: 'noFiction' };
  // The pair is created atomically (ADR-027), so a missing patterns file means someone
  // deleted half a pair by hand — a repair to report, not something to route around.
  const patternsId = toPatternsId(fiction);
  return dictionaries[patternsId] !== undefined
    ? { kind: 'open', dictionaryId: patternsId }
    : { kind: 'none', reason: 'pairMissing', patternsId };
}

export type QuickAddSurface = 'translator' | 'reader';

/** What to tell the user when Cmd-6 has nowhere to go. The Reader speaks of "this book" and
 * can point at Cmd+B; the Translator has no book. */
export function quickAddMissMessage(
  miss: Extract<QuickAddTarget, { kind: 'none' }>,
  surface: QuickAddSurface
): string {
  if (miss.reason === 'pairMissing') {
    return surface === 'reader'
      ? `This book's structural pattern dictionary (${miss.patternsId}) is missing`
      : `The active fiction's structural pattern dictionary (${miss.patternsId}) is missing`;
  }
  return surface === 'reader'
    ? 'This book has no structural pattern dictionary — bind one with Cmd+B'
    : 'No structural patterns dictionary for active fiction';
}

/** Loads the quick-add view from config. Logs and returns `null` on failure — every caller
 * then decides with no config (Cmd-5 falls to `properNouns`, Cmd-6 has no target). */
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

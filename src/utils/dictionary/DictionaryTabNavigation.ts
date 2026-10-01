import { quickAddMissMessage, quickAddTarget, type QuickAddView } from './QuickAddTarget';

/**
 * What a Cmd-1..6 digit does on the Dictionary tab: pick that dictionary's table. The
 * dispatch table (`matchHotkey`) decides that a digit reaches the Dictionary tab at all;
 * which dictionary each digit means is decided here, once, for the tab container to apply.
 */
export type DictionaryTabNavigation =
  | { kind: 'select'; dictionaryId: string }
  /** Cmd-6 has nowhere to go: its patterns half is missing or unread. `message` is for a toast. */
  | { kind: 'refused'; message: string };

/** Cmd-1..4 name a dictionary outright; Cmd-5 and Cmd-6 ask the quick-add target rule. */
const FIXED_DICTIONARIES: Readonly<Record<string, string>> = {
  '1': 'characters',
  '2': 'phrases',
  '3': 'properNouns',
  '4': 'patterns',
};

export interface DictionaryTabNavigationInputs {
  /** The quick-add view (`loadQuickAddView`). Called only for Cmd-5 and Cmd-6, so the other
   * digits never touch config. */
  loadView: () => Promise<QuickAddView | null>;
  dictionaries: { [key: string]: unknown };
  unreadDictionaryIds: readonly string[];
}

/** `null` for a key that is not one of the six digits. */
export async function dictionaryTabNavigation(
  key: string,
  { loadView, dictionaries, unreadDictionaryIds }: DictionaryTabNavigationInputs
): Promise<DictionaryTabNavigation | null> {
  const fixed = FIXED_DICTIONARIES[key];
  if (fixed) return { kind: 'select', dictionaryId: fixed };
  if (key !== '5' && key !== '6') return null;

  const target = quickAddTarget(
    key === '5' ? 'properNoun' : 'structuralPattern',
    await loadView(),
    dictionaries,
    unreadDictionaryIds
  );
  return target.kind === 'open'
    ? { kind: 'select', dictionaryId: target.dictionaryId }
    : { kind: 'refused', message: quickAddMissMessage(target) };
}

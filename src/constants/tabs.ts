import type { TabId } from '../types/ComponentTypes';

/**
 * Tab order, and the single source of it.
 *
 * Two places need this order: `TabbedInterface` renders the nav in it, and
 * `HotkeyDispatchTable` maps `Digit1..DigitN` onto it. Both derive from this array by
 * index, so the shortcut for a tab is its position here — kept in sync by construction
 * rather than by remembering to edit two files.
 *
 * The Reader is first and takes the first shortcut; the five tabs that predate it each
 * moved down by one. That was a deliberate trade — five bindings already in muscle
 * memory changed — made because the Reader is where the app should land.
 */
export const TAB_ORDER: readonly TabId[] = [
  'reader',
  'translator',
  'dictionary',
  'rules',
  'configuration',
  'appearance',
] as const;

/** The 1-based shortcut digit for a tab, or `undefined` if it has no place in the order. */
export function tabShortcutDigit(tab: TabId): number | undefined {
  const index = TAB_ORDER.indexOf(tab);
  return index === -1 ? undefined : index + 1;
}

/** The tab a 1-based shortcut digit selects, or `undefined` when nothing is bound to it. */
export function tabForShortcutDigit(digit: number): TabId | undefined {
  return TAB_ORDER[digit - 1];
}

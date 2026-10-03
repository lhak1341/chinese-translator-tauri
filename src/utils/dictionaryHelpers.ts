/**
 * Comparator for sorting dictionary lists in move/bulk-move dialogs.
 * Puts the base dictionaries ('patterns', 'phrases', 'properNouns') first — the usual move
 * targets — then sorts remaining dictionaries alphabetically by ID.
 */
const BASE_DICTIONARY_ORDER = ['properNouns', 'phrases', 'patterns'];
export function compareDictionaryOrder(a: { id: string }, b: { id: string }): number {
  const rankA = BASE_DICTIONARY_ORDER.indexOf(a.id);
  const rankB = BASE_DICTIONARY_ORDER.indexOf(b.id);
  if (rankA !== -1 || rankB !== -1) {
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  }
  return a.id.localeCompare(b.id);
}

/** A copy of `set` with `value` removed if it was there, added if it was not. For filter chips
 * held as a `Set` in state: `setSelected((prev) => toggled(prev, type))`. */
export function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

import { useEffect, useState } from 'react';

/**
 * A counter that increments whenever the Appearance settings are applied.
 *
 * Appearance reaches the rest of the app as CSS custom properties written to
 * `document.documentElement` by `applyAppearanceToCssVars` — there is no shared React
 * state, and deliberately so (ADR-024). CSS alone is enough for anything the browser
 * re-renders on its own; it is not enough for measurements taken in JavaScript, which is
 * what the Reader's virtualized panels are built from. Watching the style attribute is
 * how those measurements learn that the font under them changed, without giving the
 * Appearance hook a second consumer or lifting it into a context.
 *
 * One bump per applied settings object, not per property: `MutationObserver` delivers a
 * whole synchronous batch of attribute writes to one callback.
 */
export function useAppearanceVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setVersion((previous) => previous + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);

  return version;
}

import { useEffect, useState } from 'react';
import type React from 'react';

/**
 * Width to assume before the element has been measured — roughly a comfortable prose
 * column, so the very first estimates are sane rather than absurd.
 */
const DEFAULT_COLUMN_EM = 40;

/**
 * The text column's width in `em` of its own font size, tracked across resizes.
 *
 * `em` rather than pixels because that is the unit an unmeasured row's height is estimated
 * in: a Chinese character is one em wide by definition, so "characters that fit on a line"
 * is `columnEm / emPerChar` and needs no font metrics beyond the two numbers here.
 * Padding is subtracted because it is not available to text.
 */
export function useColumnEm(ref: React.RefObject<HTMLElement | null>): number {
  const [columnEm, setColumnEm] = useState(DEFAULT_COLUMN_EM);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = (): void => {
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      if (!(fontSize > 0)) return;
      const padding =
        Number.parseFloat(style.paddingLeft || '0') + Number.parseFloat(style.paddingRight || '0');
      const usable = element.clientWidth - padding;
      if (!(usable > 0)) return;
      setColumnEm(usable / fontSize);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columnEm;
}

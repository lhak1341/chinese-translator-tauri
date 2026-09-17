import { useEffect, useState } from 'react';
import type React from 'react';
import { useAppearanceVersion } from './useAppearanceVersion';

/**
 * Width to assume before the element has been measured — roughly a comfortable prose
 * column, so the very first estimates are sane rather than absurd.
 */
const DEFAULT_COLUMN_EM = 40;

/** Font size to assume before measuring: the browser default, in pixels. */
const DEFAULT_FONT_SIZE_PX = 16;

export interface ColumnMetrics {
  /**
   * The text column's width in `em` of its own font size.
   *
   * `em` rather than pixels because that is the unit an unmeasured row's height is
   * estimated in: a Chinese character is one em wide by definition, so "characters that
   * fit on a line" is `columnEm / emPerChar` and needs no font metrics beyond the two
   * numbers here. Padding is subtracted because it is not available to text.
   */
  columnEm: number;
  /** The rendered font size, in pixels — an estimated row's height scales with it. */
  fontSizePx: number;
}

/**
 * The text column's measurements, tracked across resizes and Appearance changes.
 *
 * Both inputs are read from the element's *computed* style, so a panel whose font comes
 * from a CSS custom property is measured at whatever the reader actually set, not at
 * whatever the stylesheet's fallback says. A `ResizeObserver` catches the column getting
 * wider or narrower; the appearance version catches a font that changed without the box
 * changing size at all, which a `ResizeObserver` never reports.
 */
export function useColumnMetrics(ref: React.RefObject<HTMLElement | null>): ColumnMetrics {
  const [metrics, setMetrics] = useState<ColumnMetrics>({
    columnEm: DEFAULT_COLUMN_EM,
    fontSizePx: DEFAULT_FONT_SIZE_PX,
  });
  const appearanceVersion = useAppearanceVersion();

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
      setMetrics({ columnEm: usable / fontSize, fontSizePx: fontSize });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, appearanceVersion]);

  return metrics;
}

import { useEffect, useState } from 'react';
import { TYPE } from '@lhak/style';
import type React from 'react';
import { useAppearanceVersion } from './useAppearanceVersion';
import { cssLengthToPx, lineHeightToPx } from '../utils/ui/CssLength';

/**
 * Width to assume before the element has been measured — roughly a comfortable prose
 * column, so the very first estimates are sane rather than absurd.
 */
const DEFAULT_COLUMN_EM = 40;

/** Font size to assume before measuring: the browser default, in pixels. */
const DEFAULT_FONT_SIZE_PX = 16;

/** Row padding to assume before measuring — `Reader.module.css`'s own default spacing. */
const DEFAULT_ROW_PADDING_PX = 16;

/**
 * Line height to assume, as a multiple of the font size, when the panel's cannot be resolved
 * (`normal`, or before the settings load) — the reading token `Reader.module.css` falls back to.
 */
const DEFAULT_LINE_HEIGHT_RATIO = TYPE.reading.lineHeight;

/**
 * The per-panel alias `Reader.module.css` sets to whichever Appearance section's paragraph
 * spacing that panel follows. Read from the panel rather than from `:root` so each one
 * resolves to its own section's value.
 */
const ROW_SPACING_PROPERTY = '--reader-paragraph-spacing';

/** The per-panel alias for its Appearance section's line height, read the same way. */
const ROW_LINE_HEIGHT_PROPERTY = '--reader-line-height';

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
  /** The paragraph spacing below each row, in pixels — added to every row's height. */
  rowPaddingPx: number;
  /** One line of a row, in pixels — the panel's Appearance line height at its font size. */
  lineHeightPx: number;
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
    rowPaddingPx: DEFAULT_ROW_PADDING_PX,
    lineHeightPx: DEFAULT_FONT_SIZE_PX * DEFAULT_LINE_HEIGHT_RATIO,
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
      // A custom property comes back as the token the stylesheet wrote (`1rem`), not as a
      // used pixel value, so the unit is resolved here against the two font sizes.
      const rootFontSizePx =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        DEFAULT_FONT_SIZE_PX;
      const context = { rootFontSizePx, fontSizePx: fontSize };
      const spacing = cssLengthToPx(style.getPropertyValue(ROW_SPACING_PROPERTY), context);
      const lineHeight = lineHeightToPx(style.getPropertyValue(ROW_LINE_HEIGHT_PROPERTY), context);
      setMetrics({
        columnEm: usable / fontSize,
        rowPaddingPx: spacing ?? DEFAULT_ROW_PADDING_PX,
        lineHeightPx: lineHeight ?? fontSize * DEFAULT_LINE_HEIGHT_RATIO,
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, appearanceVersion]);

  return metrics;
}

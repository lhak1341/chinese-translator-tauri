import { describe, expect, it } from 'vitest';
import { textOnFill } from '../textOnFill';

describe('textOnFill', () => {
  it('splits a hue fill to black or white by its OKLCH lightness at 0.73', () => {
    expect(textOnFill('var(--lk-yellow)')).toBe(
      'oklch(from var(--lk-yellow) clamp(0, (0.73 - l) * 1000, 1) 0 0)'
    );
  });

  it.each(['var(--lk-accent)', 'var(--accent-color)', 'var(--primary-color)'])(
    'gives the contract text colour on the accent fill %s',
    (fill) => {
      expect(textOnFill(fill)).toBe('var(--lk-text-on-accent)');
    }
  );
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  fromRaw,
  loadAppearanceConfig,
  saveAppearanceConfig,
} from '../appearanceConfig';

describe('appearanceConfig.fromRaw', () => {
  it('passes through a fully valid object unchanged', () => {
    const raw = {
      chineseText: {
        fontFamily: 'Arial',
        fontSize: '2rem',
        letterSpacing: 'tight',
        paragraphSpacing: '2rem',
      },
      fullTranslation: {
        fontFamily: 'Georgia',
        fontSize: '1.5rem',
        letterSpacing: 'wide',
        paragraphSpacing: '1.5rem',
      },
      characterOnly: {
        fontFamily: 'Times',
        fontSize: '1rem',
        letterSpacing: 'normal',
        paragraphSpacing: '1rem',
      },
      uiFont: { fontFamily: 'Roboto' },
      theme: 'dark',
      characterOnlyFollowsFullTranslation: false,
    };
    expect(fromRaw(raw)).toEqual(raw);
  });

  it('falls back per-leaf on wrong-typed fields, preserving valid sibling leaves', () => {
    const raw = {
      chineseText: {
        fontFamily: 'Arial', // valid — should survive
        fontSize: 123, // wrong type — should fall back
        letterSpacing: 'normal',
        paragraphSpacing: '1rem',
      },
    };
    const result = fromRaw(raw);
    expect(result.chineseText.fontFamily).toBe('Arial');
    expect(result.chineseText.fontSize).toBe(DEFAULT_APPEARANCE.chineseText.fontSize);
  });

  it('rejects an invalid letterSpacing enum value and falls back to default', () => {
    const raw = {
      chineseText: {
        fontFamily: 'Arial',
        fontSize: '1rem',
        letterSpacing: 'super-wide',
        paragraphSpacing: '1rem',
      },
    };
    const result = fromRaw(raw);
    expect(result.chineseText.letterSpacing).toBe(DEFAULT_APPEARANCE.chineseText.letterSpacing);
    expect(result.chineseText.fontFamily).toBe('Arial');
  });

  it('rejects an invalid theme enum value and falls back to default', () => {
    expect(fromRaw({ theme: 'xyz' }).theme).toBe(DEFAULT_APPEARANCE.theme);
  });

  it('accepts each valid theme value', () => {
    expect(fromRaw({ theme: 'light' }).theme).toBe('light');
    expect(fromRaw({ theme: 'dark' }).theme).toBe('dark');
    expect(fromRaw({ theme: 'auto' }).theme).toBe('auto');
  });

  it('rejects a wrong-typed characterOnlyFollowsFullTranslation and falls back to default', () => {
    expect(
      fromRaw({ characterOnlyFollowsFullTranslation: 'yes' }).characterOnlyFollowsFullTranslation
    ).toBe(DEFAULT_APPEARANCE.characterOnlyFollowsFullTranslation);
  });

  it('accepts a valid boolean characterOnlyFollowsFullTranslation', () => {
    expect(
      fromRaw({ characterOnlyFollowsFullTranslation: false }).characterOnlyFollowsFullTranslation
    ).toBe(false);
  });

  it('falls back entirely to defaults for a missing section', () => {
    expect(fromRaw({})).toEqual(DEFAULT_APPEARANCE);
  });

  it('falls back entirely to defaults for a non-object section', () => {
    expect(fromRaw({ chineseText: 'not an object' }).chineseText).toEqual(
      DEFAULT_APPEARANCE.chineseText
    );
  });

  it('validates uiFont (fontFamily only, no letterSpacing)', () => {
    expect(fromRaw({ uiFont: { fontFamily: 'Roboto' } }).uiFont).toEqual({ fontFamily: 'Roboto' });
    expect(fromRaw({ uiFont: { fontFamily: 42 } }).uiFont).toEqual(DEFAULT_APPEARANCE.uiFont);
  });
});

describe('appearanceConfig.loadAppearanceConfig / saveAppearanceConfig', () => {
  const mockLoad = vi.fn();
  const mockSave = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: { loadAppearanceSettings: mockLoad, saveAppearanceSettings: mockSave },
      writable: true,
      configurable: true,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns validated defaults when the IPC call reports success:false', async () => {
    mockLoad.mockResolvedValue({ success: false, error: 'disk error' });
    expect(await loadAppearanceConfig()).toEqual(DEFAULT_APPEARANCE);
  });

  it('returns fromRaw(data) when the IPC call succeeds', async () => {
    mockLoad.mockResolvedValue({ success: true, data: { theme: 'dark' } });
    const result = await loadAppearanceConfig();
    expect(result.theme).toBe('dark');
    expect(result.chineseText).toEqual(DEFAULT_APPEARANCE.chineseText);
  });

  it('throws when the IPC envelope itself is malformed', async () => {
    mockLoad.mockResolvedValue(null);
    await expect(loadAppearanceConfig()).rejects.toThrow();
  });

  it('resolves when save succeeds', async () => {
    mockSave.mockResolvedValue({ success: true });
    await expect(saveAppearanceConfig(DEFAULT_APPEARANCE)).resolves.toBeUndefined();
  });

  it('throws when save reports success:false', async () => {
    mockSave.mockResolvedValue({ success: false, error: 'disk full' });
    await expect(saveAppearanceConfig(DEFAULT_APPEARANCE)).rejects.toThrow('disk full');
  });
});

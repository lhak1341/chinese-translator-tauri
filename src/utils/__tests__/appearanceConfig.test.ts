import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  fromRaw,
  loadAppearanceConfig,
  saveAppearanceConfig,
  invalidateAppearanceConfig,
} from '../appearanceConfig';

describe('appearanceConfig.fromRaw', () => {
  it('passes through a fully valid object unchanged', () => {
    const raw = {
      chineseText: {
        fontFamily: 'Arial',
        fontSize: '2rem',
        letterSpacing: '-0.02em',
        paragraphSpacing: '2rem',
      },
      fullTranslation: {
        fontFamily: 'Georgia',
        fontSize: '1.5rem',
        letterSpacing: '0.05em',
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
      chineseFaceMigrated: true,
    };
    expect(fromRaw(raw)).toEqual(raw);
  });

  it('falls back per-leaf on wrong-typed fields, preserving valid sibling leaves', () => {
    const raw = {
      chineseFaceMigrated: true,
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

  it('rejects a letterSpacing that is not a CSS value and falls back to default', () => {
    const raw = {
      chineseFaceMigrated: true,
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

  // The field is free text whose placeholder asks for a length, so a length is what has to
  // survive a round trip — it did not, and reverted to `normal` on the next launch.
  it.each(['0.05em', '-0.02em', '1px', '.5rem'])('keeps the length %s', (letterSpacing) => {
    expect(fromRaw({ chineseText: { letterSpacing } }).chineseText.letterSpacing).toBe(
      letterSpacing
    );
  });

  it('trims a length that was typed with stray whitespace', () => {
    expect(fromRaw({ chineseText: { letterSpacing: '  0.05em ' } }).chineseText.letterSpacing).toBe(
      '0.05em'
    );
  });

  // `letter-spacing: tight` is not valid CSS, so the words never rendered as anything —
  // settings saved when the field was a three-way choice are migrated to what they meant.
  it.each([
    ['tight', '-0.02em'],
    ['wide', '0.05em'],
  ])('migrates the legacy %s keyword to %s', (stored, expected) => {
    expect(fromRaw({ chineseText: { letterSpacing: stored } }).chineseText.letterSpacing).toBe(
      expected
    );
  });

  it('keeps normal as itself — a real CSS keyword, not a legacy one', () => {
    expect(fromRaw({ chineseText: { letterSpacing: 'normal' } }).chineseText.letterSpacing).toBe(
      'normal'
    );
  });

  it('rejects a unit it cannot trust to mean one thing', () => {
    expect(fromRaw({ chineseText: { letterSpacing: '5%' } }).chineseText.letterSpacing).toBe(
      DEFAULT_APPEARANCE.chineseText.letterSpacing
    );
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

// The reading defaults are @lhak/style's type tokens (lhak-style-guide ticket 009):
// 24px reading at a 16px root, Chinese 0.9×, Bookerly at its own tracking, the Obsidian mix.
const MIX = "'Rounded Mplus 1c', 'Noto Sans SC', 'PingFang SC', sans-serif";

describe('appearanceConfig — defaults from the type tokens', () => {
  it('reading text is Bookerly at 24px (1.5rem) with tracking 0', () => {
    for (const section of ['fullTranslation', 'characterOnly'] as const) {
      expect(DEFAULT_APPEARANCE[section].fontFamily).toMatch(/^'Bookerly', 'Iowan Old Style',/);
      expect(DEFAULT_APPEARANCE[section].fontSize).toBe('1.5rem');
      expect(DEFAULT_APPEARANCE[section].letterSpacing).toBe('0em');
    }
  });

  it('Chinese is the Obsidian mix at 0.9 × reading (1.35rem)', () => {
    expect(DEFAULT_APPEARANCE.chineseText.fontFamily).toBe(MIX);
    expect(DEFAULT_APPEARANCE.chineseText.fontSize).toBe('1.35rem');
    expect(DEFAULT_APPEARANCE.chineseText.letterSpacing).toBe('0em');
  });

  it('the interface font is Work Sans', () => {
    expect(DEFAULT_APPEARANCE.uiFont.fontFamily).toMatch(/^'Work Sans',/);
  });

  it('a saved value still overrides the token default', () => {
    // The user's own appearance.json: 1.45rem Bookerly over the 1.5rem default.
    const saved = fromRaw({
      chineseFaceMigrated: true,
      fullTranslation: { fontFamily: 'Bookerly, Maple Mono, Inter', fontSize: '1.45rem' },
      chineseText: { fontFamily: 'Maple Mono', fontSize: '1.3rem' },
    });
    expect(saved.fullTranslation.fontSize).toBe('1.45rem');
    expect(saved.fullTranslation.fontFamily).toBe('Bookerly, Maple Mono, Inter');
    expect(saved.chineseText).toMatchObject({ fontFamily: 'Maple Mono', fontSize: '1.3rem' });
  });
});

describe('appearanceConfig — the saved Chinese face moves to the Obsidian mix once', () => {
  const before = {
    chineseText: {
      fontFamily: 'Maple Mono',
      fontSize: '1.3rem',
      letterSpacing: 'normal',
      paragraphSpacing: '1rem',
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a file saved before the move gets the mix, keeping its other Chinese settings', () => {
    const migrated = fromRaw(before);
    expect(migrated.chineseText).toEqual({ ...before.chineseText, fontFamily: MIX });
    expect(migrated.chineseFaceMigrated).toBe(true);
  });

  it('a face picked after the move is kept', () => {
    const repicked = { ...fromRaw(before), chineseText: before.chineseText };
    expect(fromRaw(JSON.parse(JSON.stringify(repicked))).chineseText.fontFamily).toBe('Maple Mono');
  });

  it('the next save records the move, so a later load keeps a re-picked face', async () => {
    invalidateAppearanceConfig();
    let onDisk: Record<string, unknown> = before;
    Object.defineProperty(window, 'electronAPI', {
      value: {
        loadAppearanceSettings: vi.fn(async () => ({ success: true, data: onDisk })),
        saveAppearanceSettings: vi.fn(async (s: Record<string, unknown>) => {
          onDisk = JSON.parse(JSON.stringify(s));
          return { success: true };
        }),
      },
      writable: true,
      configurable: true,
    });
    const loaded = await loadAppearanceConfig();
    expect(loaded.chineseText.fontFamily).toBe(MIX);
    await saveAppearanceConfig({ ...loaded, chineseText: before.chineseText });

    invalidateAppearanceConfig();
    expect((await loadAppearanceConfig()).chineseText.fontFamily).toBe('Maple Mono');
  });
});

describe('appearanceConfig.loadAppearanceConfig / saveAppearanceConfig', () => {
  const mockLoad = vi.fn();
  const mockSave = vi.fn();

  beforeEach(() => {
    invalidateAppearanceConfig();
    mockLoad.mockResolvedValue({ success: true, data: {} });
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

describe('appearanceConfig — overlapping saves', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('run one at a time, so the last save is what ends up on disk', async () => {
    invalidateAppearanceConfig();
    // A blur save and a checkbox save can start together (useAppearanceSettings). Both write
    // `appearance.json.tmp.<pid>` in Rust, so two in flight at once race on one temp path, and
    // the slower first save can land after — and over — the second.
    let onDisk: unknown = null;
    let inFlight = 0;
    let maxInFlight = 0;
    const save = vi.fn(async (settings: unknown) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const first = save.mock.calls.length === 1;
      await new Promise((resolve) => setTimeout(resolve, first ? 20 : 0));
      onDisk = settings;
      inFlight--;
      return { success: true };
    });
    Object.defineProperty(window, 'electronAPI', {
      value: {
        loadAppearanceSettings: vi.fn().mockResolvedValue({ success: true, data: {} }),
        saveAppearanceSettings: save,
      },
      writable: true,
      configurable: true,
    });
    await loadAppearanceConfig();

    const blurred = { ...DEFAULT_APPEARANCE, theme: 'dark' as const };
    const ticked = { ...blurred, characterOnlyFollowsFullTranslation: false };
    await Promise.all([saveAppearanceConfig(blurred), saveAppearanceConfig(ticked)]);

    expect(maxInFlight).toBe(1);
    expect(onDisk).toEqual(ticked);
  });
});

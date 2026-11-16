import { describe, it, expect } from 'vitest';
import { TYPE } from '@lhak/style';
import {
  applyAppearanceToCssVars,
  applyFontChange,
  applyFollowFullTranslation,
  applyReset,
} from '../ui/AppearanceReducer';
import type { AppearanceSettings } from '../../types/ComponentTypes';

const base: AppearanceSettings = {
  chineseText: {
    fontFamily: 'FontA',
    fontSize: '1rem',
    letterSpacing: 'normal',
    lineHeight: '1.45',
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'FontB',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    lineHeight: '1.45',
    paragraphSpacing: '1rem',
  },
  characterOnly: {
    fontFamily: 'FontC',
    fontSize: '1rem',
    letterSpacing: 'normal',
    lineHeight: '1.45',
    paragraphSpacing: '1rem',
  },
  uiFont: { fontFamily: 'FontD' },
  theme: 'auto',
  characterOnlyFollowsFullTranslation: false,
};

const defaults: AppearanceSettings = {
  ...base,
  chineseText: {
    fontFamily: 'DefaultA',
    fontSize: '1rem',
    letterSpacing: 'normal',
    lineHeight: '1.45',
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'DefaultB',
    fontSize: '1rem',
    letterSpacing: 'normal',
    lineHeight: '1.45',
    paragraphSpacing: '1rem',
  },
};

describe('applyFontChange', () => {
  it('updates the targeted section and property', () => {
    const result = applyFontChange(base, 'chineseText', 'fontFamily', 'NewFont');
    expect(result.chineseText.fontFamily).toBe('NewFont');
  });

  it('does not mutate other sections', () => {
    const result = applyFontChange(base, 'chineseText', 'fontFamily', 'NewFont');
    expect(result.fullTranslation.fontFamily).toBe('FontB');
    expect(result.characterOnly.fontFamily).toBe('FontC');
  });

  it('does not mirror to characterOnly when follows=false', () => {
    const result = applyFontChange(base, 'fullTranslation', 'fontFamily', 'NewFont');
    expect(result.characterOnly.fontFamily).toBe('FontC'); // unchanged
  });

  it('mirrors to characterOnly when section=fullTranslation and follows=true', () => {
    const following = { ...base, characterOnlyFollowsFullTranslation: true };
    const result = applyFontChange(following, 'fullTranslation', 'fontFamily', 'NewFont');
    expect(result.fullTranslation.fontFamily).toBe('NewFont');
    expect(result.characterOnly.fontFamily).toBe('NewFont');
  });

  it('mirrors only the changed property, not the whole section', () => {
    const following = { ...base, characterOnlyFollowsFullTranslation: true };
    const result = applyFontChange(following, 'fullTranslation', 'fontSize', '2rem');
    expect(result.characterOnly.fontSize).toBe('2rem');
    expect(result.characterOnly.fontFamily).toBe('FontC'); // unchanged
  });

  it('does not mirror when section is not fullTranslation even if follows=true', () => {
    const following = { ...base, characterOnlyFollowsFullTranslation: true };
    const result = applyFontChange(following, 'chineseText', 'fontFamily', 'NewFont');
    expect(result.characterOnly.fontFamily).toBe('FontC'); // unchanged
  });

  it('treats missing characterOnlyFollowsFullTranslation as true (default)', () => {
    const noFlag = { ...base };
    delete (noFlag as Partial<AppearanceSettings>).characterOnlyFollowsFullTranslation;
    const result = applyFontChange(
      noFlag as AppearanceSettings,
      'fullTranslation',
      'fontFamily',
      'NewFont'
    );
    expect(result.characterOnly.fontFamily).toBe('NewFont');
  });

  it('does not mutate the input object', () => {
    const original = { ...base };
    applyFontChange(base, 'chineseText', 'fontFamily', 'NewFont');
    expect(base.chineseText.fontFamily).toBe(original.chineseText.fontFamily);
  });
});

describe('applyFollowFullTranslation', () => {
  it('enabling copies fullTranslation section to characterOnly', () => {
    const result = applyFollowFullTranslation(base, true);
    expect(result.characterOnly.fontFamily).toBe('FontB');
    expect(result.characterOnly.fontSize).toBe('1.25rem');
    expect(result.characterOnlyFollowsFullTranslation).toBe(true);
  });

  it('disabling sets flag to false without changing characterOnly', () => {
    const enabled = { ...base, characterOnlyFollowsFullTranslation: true };
    const result = applyFollowFullTranslation(enabled, false);
    expect(result.characterOnlyFollowsFullTranslation).toBe(false);
    expect(result.characterOnly.fontFamily).toBe('FontC'); // unchanged
  });

  it('does not mutate other sections when enabling', () => {
    const result = applyFollowFullTranslation(base, true);
    expect(result.chineseText.fontFamily).toBe('FontA');
    expect(result.fullTranslation.fontFamily).toBe('FontB');
  });
});

describe('line height follows full translation', () => {
  const following = { ...base, characterOnlyFollowsFullTranslation: true };

  it('a full-translation line height reaches character-only while it follows', () => {
    const result = applyFontChange(following, 'fullTranslation', 'lineHeight', '1.8');
    expect(result.fullTranslation.lineHeight).toBe('1.8');
    expect(result.characterOnly.lineHeight).toBe('1.8');
  });

  it('does not reach character-only once it stops following', () => {
    const result = applyFontChange(base, 'fullTranslation', 'lineHeight', '1.8');
    expect(result.characterOnly.lineHeight).toBe('1.45');
  });

  it('turning follow on takes the full-translation line height', () => {
    const differing = {
      ...base,
      fullTranslation: { ...base.fullTranslation, lineHeight: '2' },
      characterOnly: { ...base.characterOnly, lineHeight: '1.2' },
    };
    expect(applyFollowFullTranslation(differing, true).characterOnly.lineHeight).toBe('2');
  });

  it('a Chinese line height stays in the Chinese section', () => {
    const result = applyFontChange(following, 'chineseText', 'lineHeight', '1.9');
    expect(result.chineseText.lineHeight).toBe('1.9');
    expect(result.fullTranslation.lineHeight).toBe('1.45');
    expect(result.characterOnly.lineHeight).toBe('1.45');
  });
});

describe('reset while character-only follows', () => {
  it('a full-translation reset reaches character-only too', () => {
    const following = {
      ...base,
      characterOnlyFollowsFullTranslation: true,
      fullTranslation: { ...base.fullTranslation, lineHeight: '1.4' },
      characterOnly: { ...base.characterOnly, lineHeight: '1.4' },
    };
    const result = applyReset(following, defaults, 'fullTranslation', 'lineHeight');
    expect(result.fullTranslation.lineHeight).toBe('1.45');
    expect(result.characterOnly.lineHeight).toBe('1.45');
  });

  it('does not reach character-only once it stops following', () => {
    const notFollowing = {
      ...base,
      fullTranslation: { ...base.fullTranslation, lineHeight: '1.4' },
      characterOnly: { ...base.characterOnly, lineHeight: '1.4' },
    };
    const result = applyReset(notFollowing, defaults, 'fullTranslation', 'lineHeight');
    expect(result.characterOnly.lineHeight).toBe('1.4');
  });
});

describe('applyAppearanceToCssVars', () => {
  it('writes each section its own line-height variable', () => {
    applyAppearanceToCssVars({
      ...base,
      chineseText: { ...base.chineseText, lineHeight: '1.9' },
      fullTranslation: { ...base.fullTranslation, lineHeight: '1.6' },
      characterOnly: { ...base.characterOnly, lineHeight: '30px' },
    });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--chinese-text-line-height')).toBe('1.9');
    expect(root.getPropertyValue('--full-translation-line-height')).toBe('1.6');
    expect(root.getPropertyValue('--character-only-line-height')).toBe('30px');
  });
  // The kit's faces are the default; a UI Font set in the Appearance tab replaces the kit's
  // interface and label faces, so kit parts (tables, buttons, fields) follow it too.
  const KIT_FACE_VARS = [
    '--lk-font-interface',
    '--lk-font-label',
    '--lk-tracking-interface',
    '--lk-tracking-label',
  ];
  const faceVars = () =>
    KIT_FACE_VARS.map((v) => document.documentElement.style.getPropertyValue(v));

  it('a custom UI Font becomes the kit interface and label face, at its own tracking', () => {
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: 'Avenir, sans-serif' } });
    expect(faceVars()).toEqual(['Avenir, sans-serif', 'Avenir, sans-serif', '0em', '0em']);
  });

  it('the default UI Font (the kit interface family) leaves the kit faces alone', () => {
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: 'Avenir, sans-serif' } });
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: TYPE.faces.interface.family } });
    expect(faceVars()).toEqual(['', '', '', '']);
  });

  // The UI size scales the kit's UI steps (12-25px); reading text has its own tokens.
  const STEP_VARS = ['xs', 'sm', 'md', 'lg', 'xl'].map((s) => `--lk-step-${s}`);
  const stepVars = () => STEP_VARS.map((v) => document.documentElement.style.getPropertyValue(v));

  it('a UI size other than 100% scales every kit UI step', () => {
    applyAppearanceToCssVars({ ...base, uiFont: { ...base.uiFont, scale: 1.25 } });
    expect(stepVars()).toEqual(['15px', '16px', '20px', '25px', '31.25px']);
  });

  it('100% (or no saved size) leaves the kit steps alone', () => {
    applyAppearanceToCssVars({ ...base, uiFont: { ...base.uiFont, scale: 1.25 } });
    applyAppearanceToCssVars({ ...base, uiFont: { ...base.uiFont, scale: 1 } });
    expect(stepVars()).toEqual(['', '', '', '', '']);
    applyAppearanceToCssVars({ ...base, uiFont: { ...base.uiFont, scale: 1.1 } });
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: base.uiFont.fontFamily } });
    expect(stepVars()).toEqual(['', '', '', '', '']);
  });

  it('an empty UI Font leaves the kit faces alone', () => {
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: 'Avenir, sans-serif' } });
    applyAppearanceToCssVars({ ...base, uiFont: { fontFamily: '  ' } });
    expect(faceVars()).toEqual(['', '', '', '']);
  });
});

describe('applyReset', () => {
  it('resets the targeted property to the default value', () => {
    const modified = { ...base, chineseText: { ...base.chineseText, fontFamily: 'Custom' } };
    const result = applyReset(modified, defaults, 'chineseText', 'fontFamily');
    expect(result.chineseText.fontFamily).toBe('DefaultA');
  });

  it('does not change other properties in the section', () => {
    const result = applyReset(base, defaults, 'chineseText', 'fontFamily');
    expect(result.chineseText.fontSize).toBe('1rem');
  });

  it('does not change other sections', () => {
    const result = applyReset(base, defaults, 'chineseText', 'fontFamily');
    expect(result.fullTranslation.fontFamily).toBe('FontB');
  });
});

describe('reading faces reach the reading boxes', () => {
  const css = (name: string) => document.documentElement.style.getPropertyValue(name);
  const withFace = (
    face: 'serif' | 'sans' | 'custom',
    extra: Partial<AppearanceSettings['fullTranslation']> = {}
  ): AppearanceSettings => ({
    ...base,
    fullTranslation: { ...base.fullTranslation, face, fontWeight: '520', ...extra },
    characterOnly: { ...base.characterOnly, face: 'sans', letterSpacing: '0.1em' },
  });

  it('Serif is Bookerly at its own weight and tracking, whatever Custom holds', () => {
    applyAppearanceToCssVars(withFace('serif', { letterSpacing: '0.2em' }));
    expect(css('--full-translation-font')).toBe(TYPE.faces['reading-serif'].family);
    expect(css('--full-translation-spacing')).toBe('0em');
    expect(css('--full-translation-weight')).toBe('400');
  });

  it('Sans is Work Sans at 430 and -0.02em', () => {
    applyAppearanceToCssVars(withFace('serif'));
    expect(css('--character-only-font')).toBe(TYPE.faces['reading-sans'].family);
    expect(css('--character-only-spacing')).toBe('-0.02em');
    expect(css('--character-only-weight')).toBe('430');
  });

  it("Custom is the reader's own stack, tracking and weight", () => {
    applyAppearanceToCssVars(withFace('custom', { letterSpacing: '0.05em' }));
    expect(css('--full-translation-font')).toBe('FontB');
    expect(css('--full-translation-spacing')).toBe('0.05em');
    expect(css('--full-translation-weight')).toBe('520');
  });

  it('word spacing reaches Sans and Custom, while Serif stays normal', () => {
    applyAppearanceToCssVars(withFace('custom', { wordSpacing: '-0.05em' }));
    expect(css('--full-translation-word-spacing')).toBe('-0.05em');
    applyAppearanceToCssVars(withFace('sans', { wordSpacing: '-0.04em' }));
    expect(css('--full-translation-word-spacing')).toBe('-0.04em');
    applyAppearanceToCssVars(withFace('serif', { wordSpacing: '-0.04em' }));
    expect(css('--full-translation-word-spacing')).toBe('normal');
  });

  it('a face change reaches character-only while it follows', () => {
    const next = applyFontChange(
      { ...base, characterOnlyFollowsFullTranslation: true },
      'fullTranslation',
      'face',
      'sans'
    );
    expect(next.characterOnly.face).toBe('sans');
  });
});

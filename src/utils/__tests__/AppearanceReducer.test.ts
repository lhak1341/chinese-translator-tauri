import { describe, it, expect } from 'vitest';
import { applyFontChange, applyFollowFullTranslation, applyReset } from '../ui/AppearanceReducer';
import type { AppearanceSettings } from '../../types/ComponentTypes';

const base: AppearanceSettings = {
  chineseText: {
    fontFamily: 'FontA',
    fontSize: '1rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'FontB',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  characterOnly: {
    fontFamily: 'FontC',
    fontSize: '1rem',
    letterSpacing: 'normal',
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
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'DefaultB',
    fontSize: '1rem',
    letterSpacing: 'normal',
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

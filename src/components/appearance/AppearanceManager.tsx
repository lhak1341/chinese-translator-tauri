import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AppearanceSettings } from '../../types/ComponentTypes';

/**
 * Type for appearance section keys
 */
type AppearanceSection = 'chineseText' | 'fullTranslation' | 'characterOnly' | 'uiFont';

/**
 * Type for font property keys
 */
type FontProperty = 'fontFamily' | 'fontSize' | 'letterSpacing' | 'paragraphSpacing';

/**
 * Default appearance settings
 */
const DEFAULT_APPEARANCE: AppearanceSettings = {
  chineseText: {
    fontFamily: '"Noto Sans CJK SC", SimSun, "Microsoft YaHei", Inter, system-ui, Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem'
  },
  fullTranslation: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem'
  },
  characterOnly: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem'
  },
  uiFont: {
    fontFamily: 'Inter, system-ui, Arial, sans-serif'
  },
  theme: 'auto'
};

/**
 * AppearanceManager Component
 *
 * Manages font and appearance settings for different text areas.
 * Features auto-save on blur and individual property reset.
 *
 * @returns Appearance settings management interface
 */
const AppearanceManager: React.FC = () => {
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load appearance settings on mount
  useEffect(() => {
    loadAppearanceSettings();
  }, []);

  const loadAppearanceSettings = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.loadAppearanceSettings();
      if (result.success && result.data) {
        // Ensure all properties exist with defaults
        const loadedAppearance: AppearanceSettings = {
          chineseText: {
            ...DEFAULT_APPEARANCE.chineseText,
            ...result.data.chineseText
          },
          fullTranslation: {
            ...DEFAULT_APPEARANCE.fullTranslation,
            ...result.data.fullTranslation
          },
          characterOnly: {
            ...DEFAULT_APPEARANCE.characterOnly,
            ...result.data.characterOnly
          },
          uiFont: {
            ...DEFAULT_APPEARANCE.uiFont,
            ...result.data.uiFont
          },
          theme: result.data.theme || 'auto'
        };
        setAppearance(loadedAppearance);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load appearance settings:', err);
      setError('Failed to load appearance settings');
    } finally {
      setIsLoading(false);
    }
  };

  const applyStylesToDocument = useCallback((): void => {
    // Apply custom font styles via CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--chinese-text-font', appearance.chineseText.fontFamily);
    root.style.setProperty('--chinese-text-size', appearance.chineseText.fontSize);
    root.style.setProperty('--chinese-text-spacing', appearance.chineseText.letterSpacing);
    root.style.setProperty('--chinese-text-paragraph-spacing', appearance.chineseText.paragraphSpacing || '1rem');
    root.style.setProperty('--full-translation-font', appearance.fullTranslation.fontFamily);
    root.style.setProperty('--full-translation-size', appearance.fullTranslation.fontSize);
    root.style.setProperty('--full-translation-spacing', appearance.fullTranslation.letterSpacing);
    root.style.setProperty('--full-translation-paragraph-spacing', appearance.fullTranslation.paragraphSpacing || '1rem');
    root.style.setProperty('--character-only-font', appearance.characterOnly.fontFamily);
    root.style.setProperty('--character-only-size', appearance.characterOnly.fontSize);
    root.style.setProperty('--character-only-spacing', appearance.characterOnly.letterSpacing);
    root.style.setProperty('--character-only-paragraph-spacing', appearance.characterOnly.paragraphSpacing || '1rem');
    root.style.setProperty('--ui-font', appearance.uiFont.fontFamily);
  }, [appearance]);

  // Apply styles when appearance changes
  useEffect(() => {
    applyStylesToDocument();
  }, [appearance, applyStylesToDocument]);

  const handleFontChange = (section: AppearanceSection, property: FontProperty, value: string): void => {
    setAppearance(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [property]: value
      }
    }));
  };

  // Auto-save when user finishes editing (onBlur)
  const handleAutoSave = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.saveAppearanceSettings(appearance);
      if (result.success) {
        // Apply styles immediately to the document
        applyStylesToDocument();
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to save appearance settings');
      }
    } catch (err) {
      console.error('Failed to auto-save appearance settings:', err);
      setError('Failed to save appearance settings');
    }
  };

  // Reset individual property to default
  const resetToDefault = async (section: AppearanceSection, property: FontProperty): Promise<void> => {
    const defaultValue = DEFAULT_APPEARANCE[section][property as keyof typeof DEFAULT_APPEARANCE[typeof section]];

    const newAppearance: AppearanceSettings = {
      ...appearance,
      [section]: {
        ...appearance[section],
        [property]: defaultValue
      }
    };

    setAppearance(newAppearance);

    // Auto-save after reset
    try {
      const result = await window.electronAPI.saveAppearanceSettings(newAppearance);
      if (result.success) {
        applyStylesToDocument();
        setError(null);
      }
    } catch (err) {
      console.error('Failed to save after reset:', err);
      setError('Failed to save appearance settings');
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    padding: '2rem',
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box'
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '2rem'
  };

  const titleStyle: React.CSSProperties = {
    marginBottom: '1.5rem'
  };

  const sectionTitleStyle: React.CSSProperties = {
    marginBottom: '1rem'
  };

  const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  };

  const controlRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  };

  const labelStyle: React.CSSProperties = {
    minWidth: '160px',
    fontSize: '0.9rem',
    fontWeight: '500',
    color: 'var(--text-color)'
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '0.5rem',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    backgroundColor: 'var(--background-color)',
    color: 'var(--text-color)',
    fontSize: '0.9rem'
  };

  const resetButtonStyle: React.CSSProperties = {
    padding: '0.5rem',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    backgroundColor: 'var(--nav-hover)',
    color: 'var(--text-color)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '2rem',
    height: '2rem'
  };

  const previewStyle: React.CSSProperties = {
    padding: '1rem',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    backgroundColor: 'var(--background-color)',
    marginTop: '1rem'
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          Loading appearance settings...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>
        <h2>Appearance Settings</h2>
        <p>Customize the font family and size for each text area.</p>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: 'var(--error-bg)',
          color: 'white',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {/* Chinese Text Box Settings */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Chinese Text Box</h3>
        <div style={controlGroupStyle}>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Font:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.chineseText.fontFamily}
              onChange={(e) => handleFontChange('chineseText', 'fontFamily', e.target.value)}
              onBlur={handleAutoSave}
              placeholder='e.g., "Noto Sans CJK SC", Arial, sans-serif'
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('chineseText', 'fontFamily')}
              title="Reset font to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Size:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.chineseText.fontSize}
              onChange={(e) => handleFontChange('chineseText', 'fontSize', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., 1.25rem, 20px, 14pt"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('chineseText', 'fontSize')}
              title="Reset size to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Letter Spacing:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.chineseText.letterSpacing}
              onChange={(e) => handleFontChange('chineseText', 'letterSpacing', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('chineseText', 'letterSpacing')}
              title="Reset letter spacing to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={{
            ...previewStyle,
            fontFamily: appearance.chineseText.fontFamily,
            fontSize: appearance.chineseText.fontSize,
            letterSpacing: appearance.chineseText.letterSpacing
          }}>
            这是中文文本的预览样式。你好世界！
          </div>
        </div>
      </div>

      {/* Full Translation Box Settings */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Full Translation Box</h3>
        <div style={controlGroupStyle}>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Font:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.fullTranslation.fontFamily}
              onChange={(e) => handleFontChange('fullTranslation', 'fontFamily', e.target.value)}
              onBlur={handleAutoSave}
              placeholder='e.g., Bookerly, "Times New Roman", serif'
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('fullTranslation', 'fontFamily')}
              title="Reset font to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Size:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.fullTranslation.fontSize}
              onChange={(e) => handleFontChange('fullTranslation', 'fontSize', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., 1.25rem, 20px, 14pt"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('fullTranslation', 'fontSize')}
              title="Reset size to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Letter Spacing:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.fullTranslation.letterSpacing}
              onChange={(e) => handleFontChange('fullTranslation', 'letterSpacing', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('fullTranslation', 'letterSpacing')}
              title="Reset letter spacing to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Paragraph Spacing:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.fullTranslation.paragraphSpacing || '1rem'}
              onChange={(e) => handleFontChange('fullTranslation', 'paragraphSpacing', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., 1rem, 16px, 1.5em"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('fullTranslation', 'paragraphSpacing')}
              title="Reset paragraph spacing to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={{
            ...previewStyle,
            fontFamily: appearance.fullTranslation.fontFamily,
            fontSize: appearance.fullTranslation.fontSize,
            letterSpacing: appearance.fullTranslation.letterSpacing
          }}>
            This is a preview of the full translation style. Hello world!
          </div>
        </div>
      </div>

      {/* Character Only Box Settings */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Character Only Box</h3>
        <div style={controlGroupStyle}>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Font:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.characterOnly.fontFamily}
              onChange={(e) => handleFontChange('characterOnly', 'fontFamily', e.target.value)}
              onBlur={handleAutoSave}
              placeholder='e.g., Bookerly, Arial, sans-serif'
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('characterOnly', 'fontFamily')}
              title="Reset font to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Size:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.characterOnly.fontSize}
              onChange={(e) => handleFontChange('characterOnly', 'fontSize', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., 1.25rem, 20px, 14pt"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('characterOnly', 'fontSize')}
              title="Reset size to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Letter Spacing:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.characterOnly.letterSpacing}
              onChange={(e) => handleFontChange('characterOnly', 'letterSpacing', e.target.value)}
              onBlur={handleAutoSave}
              placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('characterOnly', 'letterSpacing')}
              title="Reset letter spacing to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div style={{
            ...previewStyle,
            fontFamily: appearance.characterOnly.fontFamily,
            fontSize: appearance.characterOnly.fontSize,
            letterSpacing: appearance.characterOnly.letterSpacing
          }}>
            This is a preview of the character-only translation style.
          </div>
        </div>
      </div>

      {/* UI Font Settings */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>UI Font</h3>
        <div style={controlGroupStyle}>
          <div style={controlRowStyle}>
            <label style={labelStyle}>Font:</label>
            <input
              type="text"
              style={inputStyle}
              value={appearance.uiFont.fontFamily}
              onChange={(e) => handleFontChange('uiFont', 'fontFamily', e.target.value)}
              onBlur={handleAutoSave}
              placeholder='e.g., Inter, system-ui, Arial, sans-serif'
            />
            <button
              style={resetButtonStyle}
              onClick={() => resetToDefault('uiFont', 'fontFamily')}
              title="Reset UI font to default"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default AppearanceManager;

import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AppearanceSettings } from '../../types/ComponentTypes';
import styles from '../../styles/AppearanceManager.module.css';
import { logger } from '../../utils/logger';

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
    fontFamily:
      '"Noto Sans CJK SC", SimSun, "Microsoft YaHei", Inter, system-ui, Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  fullTranslation: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  characterOnly: {
    fontFamily: 'Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif',
    fontSize: '1.25rem',
    letterSpacing: 'normal',
    paragraphSpacing: '1rem',
  },
  uiFont: {
    fontFamily: 'Inter, system-ui, Arial, sans-serif',
  },
  theme: 'auto',
  // Default: Character Only follows Full Translation style
  characterOnlyFollowsFullTranslation: true,
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
  const [characterOnlyFollowsFullTranslation, setCharacterOnlyFollowsFullTranslation] =
    useState<boolean>(true);

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
            ...result.data.chineseText,
          },
          fullTranslation: {
            ...DEFAULT_APPEARANCE.fullTranslation,
            ...result.data.fullTranslation,
          },
          characterOnly: {
            ...DEFAULT_APPEARANCE.characterOnly,
            ...result.data.characterOnly,
          },
          uiFont: {
            ...DEFAULT_APPEARANCE.uiFont,
            ...result.data.uiFont,
          },
          theme: result.data.theme || 'auto',
          characterOnlyFollowsFullTranslation:
            result.data.characterOnlyFollowsFullTranslation ?? true,
        };
        setAppearance(loadedAppearance);
        setCharacterOnlyFollowsFullTranslation(
          result.data.characterOnlyFollowsFullTranslation ?? true
        );
      }
      setError(null);
    } catch (err) {
      logger.error('Failed to load appearance settings:', err);
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
    root.style.setProperty(
      '--chinese-text-paragraph-spacing',
      appearance.chineseText.paragraphSpacing || '1rem'
    );
    root.style.setProperty('--full-translation-font', appearance.fullTranslation.fontFamily);
    root.style.setProperty('--full-translation-size', appearance.fullTranslation.fontSize);
    root.style.setProperty('--full-translation-spacing', appearance.fullTranslation.letterSpacing);
    root.style.setProperty(
      '--full-translation-paragraph-spacing',
      appearance.fullTranslation.paragraphSpacing || '1rem'
    );
    root.style.setProperty('--character-only-font', appearance.characterOnly.fontFamily);
    root.style.setProperty('--character-only-size', appearance.characterOnly.fontSize);
    root.style.setProperty('--character-only-spacing', appearance.characterOnly.letterSpacing);
    root.style.setProperty(
      '--character-only-paragraph-spacing',
      appearance.characterOnly.paragraphSpacing || '1rem'
    );
    root.style.setProperty('--ui-font', appearance.uiFont.fontFamily);
  }, [appearance]);

  // Apply styles when appearance changes
  useEffect(() => {
    applyStylesToDocument();
  }, [appearance, applyStylesToDocument]);

  const handleFontChange = (
    section: AppearanceSection,
    property: FontProperty,
    value: string
  ): void => {
    setAppearance((prev) => {
      const newAppearance = {
        ...prev,
        [section]: {
          ...prev[section],
          [property]: value,
        },
      };

      // If Full Translation is changed and Character Only follows it, sync the change
      if (section === 'fullTranslation' && characterOnlyFollowsFullTranslation) {
        newAppearance.characterOnly = {
          ...newAppearance.characterOnly,
          [property]: value,
        };
      }

      return newAppearance;
    });
  };

  // Auto-save when user finishes editing (onBlur)
  const handleAutoSave = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.saveAppearanceSettings({
        ...appearance,
        characterOnlyFollowsFullTranslation,
      });
      if (result.success) {
        // Apply styles immediately to the document
        applyStylesToDocument();
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to save appearance settings');
      }
    } catch (err) {
      logger.error('Failed to auto-save appearance settings:', err);
      setError('Failed to save appearance settings');
    }
  };

  // Handle checkbox toggle for Character Only following Full Translation
  const handleFollowFullTranslationChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const isChecked = e.target.checked;
    setCharacterOnlyFollowsFullTranslation(isChecked);

    // If checked, sync all properties from Full Translation to Character Only
    if (isChecked) {
      const newAppearance: AppearanceSettings = {
        ...appearance,
        characterOnly: {
          ...appearance.fullTranslation,
        },
        characterOnlyFollowsFullTranslation: true,
      };
      setAppearance(newAppearance);

      // Auto-save immediately
      try {
        const result = await window.electronAPI.saveAppearanceSettings(newAppearance);
        if (result.success) {
          applyStylesToDocument();
          setError(null);
        }
      } catch (err) {
        logger.error('Failed to save after checkbox change:', err);
        setError('Failed to save appearance settings');
      }
    } else {
      // Just save the checkbox state
      try {
        const result = await window.electronAPI.saveAppearanceSettings({
          ...appearance,
          characterOnlyFollowsFullTranslation: false,
        });
        if (result.success) {
          setError(null);
        }
      } catch (err) {
        logger.error('Failed to save after checkbox change:', err);
        setError('Failed to save appearance settings');
      }
    }
  };

  // Reset individual property to default
  const resetToDefault = async (
    section: AppearanceSection,
    property: FontProperty
  ): Promise<void> => {
    const defaultValue =
      DEFAULT_APPEARANCE[section][property as keyof (typeof DEFAULT_APPEARANCE)[typeof section]];

    const newAppearance: AppearanceSettings = {
      ...appearance,
      [section]: {
        ...appearance[section],
        [property]: defaultValue,
      },
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
      logger.error('Failed to save after reset:', err);
      setError('Failed to save appearance settings');
    }
  };

  // Delegated event handlers — data-section/data-property on inputs/buttons
  // eliminate per-element inline arrow functions (24 → 2 function allocations per render).
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const section = e.target.dataset.section as AppearanceSection;
    const property = e.target.dataset.property as FontProperty;
    handleFontChange(section, property, e.target.value);
  };

  const handleResetClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const section = e.currentTarget.dataset.section as AppearanceSection;
    const property = e.currentTarget.dataset.property as FontProperty;
    resetToDefault(section, property);
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
        <span className={styles.loadingText}>Loading appearance settings...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.columnsContainer}>
        {/* Left Column: Chinese Text & UI Font */}
        <div className={styles.column}>
          {/* Chinese Text Box Settings */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Chinese Text Box</h3>
            <div className={styles.controlGroup}>
              <div className={styles.controlRow}>
                <label className={styles.label}>Font:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.chineseText.fontFamily}
                  data-section="chineseText"
                  data-property="fontFamily"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder='e.g., "Noto Sans CJK SC", Arial, sans-serif'
                />
                <button
                  className={styles.resetButton}
                  data-section="chineseText"
                  data-property="fontFamily"
                  onClick={handleResetClick}
                  title="Reset font to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Size:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.chineseText.fontSize}
                  data-section="chineseText"
                  data-property="fontSize"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1.25rem, 20px, 14pt"
                />
                <button
                  className={styles.resetButton}
                  data-section="chineseText"
                  data-property="fontSize"
                  onClick={handleResetClick}
                  title="Reset size to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Letter Spacing:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.chineseText.letterSpacing}
                  data-section="chineseText"
                  data-property="letterSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
                />
                <button
                  className={styles.resetButton}
                  data-section="chineseText"
                  data-property="letterSpacing"
                  onClick={handleResetClick}
                  title="Reset letter spacing to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div
                className={styles.preview}
                style={{
                  fontFamily: appearance.chineseText.fontFamily,
                  fontSize: appearance.chineseText.fontSize,
                  letterSpacing: appearance.chineseText.letterSpacing,
                }}
              >
                这是中文文本的预览样式。你好世界！
              </div>
            </div>
          </div>

          {/* UI Font Settings */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>UI Font</h3>
            <div className={styles.controlGroup}>
              <div className={styles.controlRow}>
                <label className={styles.label}>Font:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.uiFont.fontFamily}
                  data-section="uiFont"
                  data-property="fontFamily"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., Inter, system-ui, Arial, sans-serif"
                />
                <button
                  className={styles.resetButton}
                  data-section="uiFont"
                  data-property="fontFamily"
                  onClick={handleResetClick}
                  title="Reset UI font to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Full Translation & Character Only */}
        <div className={styles.column}>
          {/* Full Translation Box Settings */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Full Translation Box</h3>
            <div className={styles.controlGroup}>
              <div className={styles.controlRow}>
                <label className={styles.label}>Font:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.fullTranslation.fontFamily}
                  data-section="fullTranslation"
                  data-property="fontFamily"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder='e.g., Bookerly, "Times New Roman", serif'
                />
                <button
                  className={styles.resetButton}
                  data-section="fullTranslation"
                  data-property="fontFamily"
                  onClick={handleResetClick}
                  title="Reset font to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Size:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.fullTranslation.fontSize}
                  data-section="fullTranslation"
                  data-property="fontSize"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1.25rem, 20px, 14pt"
                />
                <button
                  className={styles.resetButton}
                  data-section="fullTranslation"
                  data-property="fontSize"
                  onClick={handleResetClick}
                  title="Reset size to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Letter Spacing:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.fullTranslation.letterSpacing}
                  data-section="fullTranslation"
                  data-property="letterSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
                />
                <button
                  className={styles.resetButton}
                  data-section="fullTranslation"
                  data-property="letterSpacing"
                  onClick={handleResetClick}
                  title="Reset letter spacing to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Paragraph Spacing:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.fullTranslation.paragraphSpacing || '1rem'}
                  data-section="fullTranslation"
                  data-property="paragraphSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1rem, 16px, 1.5em"
                />
                <button
                  className={styles.resetButton}
                  data-section="fullTranslation"
                  data-property="paragraphSpacing"
                  onClick={handleResetClick}
                  title="Reset paragraph spacing to default"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div
                className={styles.preview}
                style={{
                  fontFamily: appearance.fullTranslation.fontFamily,
                  fontSize: appearance.fullTranslation.fontSize,
                  letterSpacing: appearance.fullTranslation.letterSpacing,
                }}
              >
                This is a preview of the full translation style. Hello world!
              </div>
            </div>
          </div>

          {/* Character Only Box Settings */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Character Only Box</h3>
            <div className={styles.controlGroup}>
              {/* Checkbox to follow Full Translation style */}
              <div className={styles.controlRow}>
                <label className={styles.label}>
                  <input
                    type="checkbox"
                    checked={characterOnlyFollowsFullTranslation}
                    onChange={handleFollowFullTranslationChange}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Follow Full Translation Box style
                </label>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Font:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.fontFamily}
                  data-section="characterOnly"
                  data-property="fontFamily"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., Bookerly, Arial, sans-serif"
                  disabled={characterOnlyFollowsFullTranslation}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="fontFamily"
                  onClick={handleResetClick}
                  title="Reset font to default"
                  disabled={characterOnlyFollowsFullTranslation}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Size:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.fontSize}
                  data-section="characterOnly"
                  data-property="fontSize"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1.25rem, 20px, 14pt"
                  disabled={characterOnlyFollowsFullTranslation}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="fontSize"
                  onClick={handleResetClick}
                  title="Reset size to default"
                  disabled={characterOnlyFollowsFullTranslation}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Letter Spacing:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.letterSpacing}
                  data-section="characterOnly"
                  data-property="letterSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
                  disabled={characterOnlyFollowsFullTranslation}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="letterSpacing"
                  onClick={handleResetClick}
                  title="Reset letter spacing to default"
                  disabled={characterOnlyFollowsFullTranslation}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.label}>Paragraph Spacing:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.paragraphSpacing || '1rem'}
                  data-section="characterOnly"
                  data-property="paragraphSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1rem, 16px, 1.5em"
                  disabled={characterOnlyFollowsFullTranslation}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="paragraphSpacing"
                  onClick={handleResetClick}
                  title="Reset paragraph spacing to default"
                  disabled={characterOnlyFollowsFullTranslation}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div
                className={styles.preview}
                style={{
                  fontFamily: appearance.characterOnly.fontFamily,
                  fontSize: appearance.characterOnly.fontSize,
                  letterSpacing: appearance.characterOnly.letterSpacing,
                }}
              >
                This is a preview of the character-only translation style.
              </div>
            </div>
          </div>
        </div>
        {/* End Right Column */}
      </div>
      {/* End Columns Container */}
    </div>
  );
};

export default AppearanceManager;

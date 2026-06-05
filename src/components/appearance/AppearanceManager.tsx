import React from 'react';
import { RotateCcw } from 'lucide-react';
import styles from '../../styles/AppearanceManager.module.css';
import { useAppearanceSettings } from '../../hooks/useAppearanceSettings';

const AppearanceManager: React.FC = () => {
  const {
    appearance,
    isLoading,
    error,
    handleInputChange,
    handleAutoSave,
    handleResetClick,
    handleFollowFullTranslationChange,
  } = useAppearanceSettings();

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
                <label htmlFor="ct-font" className={styles.label}>
                  Font:
                </label>
                <input
                  id="ct-font"
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
                <label htmlFor="ct-size" className={styles.label}>
                  Size:
                </label>
                <input
                  id="ct-size"
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
                <label htmlFor="ct-spacing" className={styles.label}>
                  Letter Spacing:
                </label>
                <input
                  id="ct-spacing"
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
                <label htmlFor="ui-font" className={styles.label}>
                  Font:
                </label>
                <input
                  id="ui-font"
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
                <label htmlFor="ft-font" className={styles.label}>
                  Font:
                </label>
                <input
                  id="ft-font"
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
                <label htmlFor="ft-size" className={styles.label}>
                  Size:
                </label>
                <input
                  id="ft-size"
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
                <label htmlFor="ft-spacing" className={styles.label}>
                  Letter Spacing:
                </label>
                <input
                  id="ft-spacing"
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
                <label htmlFor="ft-paragraph" className={styles.label}>
                  Paragraph Spacing:
                </label>
                <input
                  id="ft-paragraph"
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
                    checked={appearance.characterOnlyFollowsFullTranslation ?? true}
                    onChange={handleFollowFullTranslationChange}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Follow Full Translation Box style
                </label>
              </div>
              <div className={styles.controlRow}>
                <label htmlFor="co-font" className={styles.label}>
                  Font:
                </label>
                <input
                  id="co-font"
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.fontFamily}
                  data-section="characterOnly"
                  data-property="fontFamily"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., Bookerly, Arial, sans-serif"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="fontFamily"
                  onClick={handleResetClick}
                  title="Reset font to default"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label htmlFor="co-size" className={styles.label}>
                  Size:
                </label>
                <input
                  id="co-size"
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.fontSize}
                  data-section="characterOnly"
                  data-property="fontSize"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1.25rem, 20px, 14pt"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="fontSize"
                  onClick={handleResetClick}
                  title="Reset size to default"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label htmlFor="co-spacing" className={styles.label}>
                  Letter Spacing:
                </label>
                <input
                  id="co-spacing"
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.letterSpacing}
                  data-section="characterOnly"
                  data-property="letterSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., normal, 0.05em (wider), -0.02em (tighter)"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="letterSpacing"
                  onClick={handleResetClick}
                  title="Reset letter spacing to default"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className={styles.controlRow}>
                <label htmlFor="co-paragraph" className={styles.label}>
                  Paragraph Spacing:
                </label>
                <input
                  id="co-paragraph"
                  type="text"
                  className={styles.input}
                  value={appearance.characterOnly.paragraphSpacing || '1rem'}
                  data-section="characterOnly"
                  data-property="paragraphSpacing"
                  onChange={handleInputChange}
                  onBlur={handleAutoSave}
                  placeholder="e.g., 1rem, 16px, 1.5em"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
                />
                <button
                  className={styles.resetButton}
                  data-section="characterOnly"
                  data-property="paragraphSpacing"
                  onClick={handleResetClick}
                  title="Reset paragraph spacing to default"
                  disabled={appearance.characterOnlyFollowsFullTranslation ?? true}
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

import React from 'react';
import { RotateCcw } from 'lucide-react';
import styles from '../../styles/AppearanceManager.module.css';
import { useAppearanceSettings } from '../../hooks/useAppearanceSettings';
import type { AppearanceSection, FontProperty } from '../../utils/ui/AppearanceReducer';
import type { AppearanceSettings } from '../../types/ComponentTypes';

interface FieldConfig {
  property: FontProperty;
  label: string;
  placeholder: string;
}

interface FieldGroup {
  section: AppearanceSection;
  title: string;
  column: 'left' | 'right';
  fields: FieldConfig[];
  previewText?: string;
  disabled?: (appearance: AppearanceSettings) => boolean;
}

const LETTER_SPACING_PLACEHOLDER = 'e.g., normal, 0.05em (wider), -0.02em (tighter)';
const FONT_SIZE_PLACEHOLDER = 'e.g., 1.25rem, 20px, 14pt';
const PARAGRAPH_SPACING_PLACEHOLDER = 'e.g., 1rem, 16px, 1.5em';

const FIELD_GROUPS: FieldGroup[] = [
  {
    section: 'chineseText',
    title: 'Chinese Text Box',
    column: 'left',
    fields: [
      {
        property: 'fontFamily',
        label: 'Font:',
        placeholder: 'e.g., "Noto Sans CJK SC", Arial, sans-serif',
      },
      { property: 'fontSize', label: 'Size:', placeholder: FONT_SIZE_PLACEHOLDER },
      {
        property: 'letterSpacing',
        label: 'Letter Spacing:',
        placeholder: LETTER_SPACING_PLACEHOLDER,
      },
    ],
    previewText: '这是中文文本的预览样式。你好世界！',
  },
  {
    section: 'uiFont',
    title: 'UI Font',
    column: 'left',
    fields: [
      {
        property: 'fontFamily',
        label: 'Font:',
        placeholder: 'e.g., Inter, system-ui, Arial, sans-serif',
      },
    ],
  },
  {
    section: 'fullTranslation',
    title: 'Full Translation Box',
    column: 'right',
    fields: [
      {
        property: 'fontFamily',
        label: 'Font:',
        placeholder: 'e.g., Bookerly, "Times New Roman", serif',
      },
      { property: 'fontSize', label: 'Size:', placeholder: FONT_SIZE_PLACEHOLDER },
      {
        property: 'letterSpacing',
        label: 'Letter Spacing:',
        placeholder: LETTER_SPACING_PLACEHOLDER,
      },
      {
        property: 'paragraphSpacing',
        label: 'Paragraph Spacing:',
        placeholder: PARAGRAPH_SPACING_PLACEHOLDER,
      },
    ],
    previewText: 'This is a preview of the full translation style. Hello world!',
  },
  {
    section: 'characterOnly',
    title: 'Character Only Box',
    column: 'right',
    fields: [
      { property: 'fontFamily', label: 'Font:', placeholder: 'e.g., Bookerly, Arial, sans-serif' },
      { property: 'fontSize', label: 'Size:', placeholder: FONT_SIZE_PLACEHOLDER },
      {
        property: 'letterSpacing',
        label: 'Letter Spacing:',
        placeholder: LETTER_SPACING_PLACEHOLDER,
      },
      {
        property: 'paragraphSpacing',
        label: 'Paragraph Spacing:',
        placeholder: PARAGRAPH_SPACING_PLACEHOLDER,
      },
    ],
    previewText: 'This is a preview of the character-only translation style.',
    disabled: (appearance) => appearance.characterOnlyFollowsFullTranslation ?? true,
  },
];

interface FontControlRowProps {
  section: AppearanceSection;
  property: FontProperty;
  label: string;
  placeholder: string;
  value: string;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onReset: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function FontControlRow({
  section,
  property,
  label,
  placeholder,
  value,
  disabled,
  onChange,
  onBlur,
  onReset,
}: FontControlRowProps) {
  const id = `${section}-${property}`;
  const resetTitle = `Reset ${label.replace(/:$/, '').toLowerCase()} to default`;

  return (
    <div className={styles.controlRow}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={styles.input}
        value={value}
        data-section={section}
        data-property={property}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        className={styles.resetButton}
        data-section={section}
        data-property={property}
        onClick={onReset}
        title={resetTitle}
        disabled={disabled}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

interface FontControlGroupProps {
  group: FieldGroup;
  appearance: AppearanceSettings;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onReset: (e: React.MouseEvent<HTMLButtonElement>) => void;
  beforeFields?: React.ReactNode;
}

function FontControlGroup({
  group,
  appearance,
  onChange,
  onBlur,
  onReset,
  beforeFields,
}: FontControlGroupProps) {
  const sectionValues = appearance[group.section] as unknown as Record<string, string | undefined>;
  const disabled = group.disabled?.(appearance);

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{group.title}</h3>
      <div className={styles.controlGroup}>
        {beforeFields}
        {group.fields.map((field) => {
          const raw = sectionValues[field.property];
          const value = field.property === 'paragraphSpacing' ? (raw ?? '1rem') : (raw ?? '');
          return (
            <FontControlRow
              key={field.property}
              section={group.section}
              property={field.property}
              label={field.label}
              placeholder={field.placeholder}
              value={value}
              disabled={disabled}
              onChange={onChange}
              onBlur={onBlur}
              onReset={onReset}
            />
          );
        })}
        {group.previewText && (
          <div
            className={styles.preview}
            style={{
              fontFamily: sectionValues.fontFamily,
              fontSize: sectionValues.fontSize,
              letterSpacing: sectionValues.letterSpacing,
            }}
          >
            {group.previewText}
          </div>
        )}
      </div>
    </div>
  );
}

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

  const leftGroups = FIELD_GROUPS.filter((g) => g.column === 'left');
  const rightGroups = FIELD_GROUPS.filter((g) => g.column === 'right');

  const followCheckbox = (
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
  );

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.columnsContainer}>
        <div className={styles.column}>
          {leftGroups.map((group) => (
            <FontControlGroup
              key={group.section}
              group={group}
              appearance={appearance}
              onChange={handleInputChange}
              onBlur={handleAutoSave}
              onReset={handleResetClick}
            />
          ))}
        </div>

        <div className={styles.column}>
          {rightGroups.map((group) => (
            <FontControlGroup
              key={group.section}
              group={group}
              appearance={appearance}
              onChange={handleInputChange}
              onBlur={handleAutoSave}
              onReset={handleResetClick}
              beforeFields={group.section === 'characterOnly' ? followCheckbox : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AppearanceManager;

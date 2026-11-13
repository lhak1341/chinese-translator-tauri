import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, Icon, Switch, TextField, ThemeSwitch } from '@lhak/style/react';
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
const LINE_HEIGHT_PLACEHOLDER = 'e.g., 1.45, 1.8, 28px';
const LINE_HEIGHT_FIELD: FieldConfig = {
  property: 'lineHeight',
  label: 'Line Height:',
  placeholder: LINE_HEIGHT_PLACEHOLDER,
};

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
      LINE_HEIGHT_FIELD,
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
      LINE_HEIGHT_FIELD,
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
      LINE_HEIGHT_FIELD,
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
      <TextField
        id={id}
        type="text"
        className={styles.field}
        value={value}
        data-section={section}
        data-property={property}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Button
        iconOnly
        aria-label={resetTitle}
        data-section={section}
        data-property={property}
        onClick={onReset}
        title={resetTitle}
        disabled={disabled}
      >
        <Icon icon={RotateCcw} />
      </Button>
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
              lineHeight: sectionValues.lineHeight,
            }}
          >
            {group.previewText}
          </div>
        )}
      </div>
    </div>
  );
}

/** Flavor and mode of the @lhak/style token contract. The kit's ThemeProvider applies and
 * remembers them, so nothing here goes through appearance.json. */
function ThemeSection() {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Theme</h3>
      <ThemeSwitch />
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

  const followSwitch = (
    <div className={styles.controlRow}>
      <Switch
        checked={appearance.characterOnlyFollowsFullTranslation ?? true}
        onCheckedChange={handleFollowFullTranslationChange}
      >
        <span className={styles.label}>Follow Full Translation Box style</span>
      </Switch>
    </div>
  );

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.columnsContainer}>
        <div className={styles.column}>
          <ThemeSection />
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
              beforeFields={group.section === 'characterOnly' ? followSwitch : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Memoized: every tab stays mounted, so without it each tab switch re-renders this tab too.
export default React.memo(AppearanceManager);

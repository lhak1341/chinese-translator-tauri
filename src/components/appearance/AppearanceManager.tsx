import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Button,
  Icon,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  TextField,
  ThemeSwitch,
  type SettingFollows,
} from '@lhak/style/react';
import styles from '../../styles/AppearanceManager.module.css';
import { useAppearanceSettings } from '../../hooks/useAppearanceSettings';
import { UI_SCALES } from '../../utils/appearanceConfig';
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
    <SettingRow label={label}>
      <TextField
        id={id}
        type="text"
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
    </SettingRow>
  );
}

interface FontControlGroupProps {
  group: FieldGroup;
  appearance: AppearanceSettings;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onReset: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** The section this one can follow (character-only follows full translation). */
  follows?: SettingFollows;
  /** Rows after the font fields (the UI Font group's size). */
  extraRows?: React.ReactNode;
}

function FontControlGroup({
  group,
  appearance,
  onChange,
  onBlur,
  onReset,
  follows,
  extraRows,
}: FontControlGroupProps) {
  const sectionValues = appearance[group.section] as unknown as Record<string, string | undefined>;
  // Following another section disables this one's rows. The kit group's fieldset already
  // does; each row also says so itself, so its field and reset button read disabled
  // wherever a <fieldset disabled> is not honoured (happy-dom).
  const disabled = follows?.checked ?? false;

  return (
    <SettingGroup title={group.title} follows={follows}>
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
      {extraRows}
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
    </SettingGroup>
  );
}

/** The UI size choices: each scale as a percentage. */
const UI_SCALE_ITEMS = UI_SCALES.map((scale) => ({
  value: String(scale),
  label: `${Math.round(scale * 100)}%`,
}));

/** Flavor and mode of the @lhak/style token contract. The kit's ThemeProvider applies and
 * remembers them, so nothing here goes through appearance.json. */
function ThemeSection() {
  return (
    <SettingGroup title="Theme">
      <ThemeSwitch />
    </SettingGroup>
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
    handleUiScaleChange,
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

  // The UI size scales every kit UI step (AppearanceReducer.applyUiScaleToKit); saved at once.
  const uiSizeRow = (
    <SettingRow group label="Size:">
      <SegmentedControl
        aria-label="UI size"
        items={UI_SCALE_ITEMS}
        value={String(appearance.uiFont.scale ?? 1)}
        onValueChange={(value) => void handleUiScaleChange(Number(value))}
      />
    </SettingRow>
  );

  const followFullTranslation: SettingFollows = {
    label: 'Follow Full Translation Box style',
    checked: appearance.characterOnlyFollowsFullTranslation ?? true,
    onCheckedChange: handleFollowFullTranslationChange,
  };

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
              extraRows={group.section === 'uiFont' ? uiSizeRow : undefined}
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
              follows={group.section === 'characterOnly' ? followFullTranslation : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Memoized: every tab stays mounted, so without it each tab switch re-renders this tab too.
export default React.memo(AppearanceManager);

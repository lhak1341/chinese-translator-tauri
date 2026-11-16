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
import {
  resolveReadingType,
  type AppearanceSection,
  type FontProperty,
} from '../../utils/ui/AppearanceReducer';
import type { AppearanceSettings, FontSettings, ReadingFace } from '../../types/ComponentTypes';

interface FieldConfig {
  property: FontProperty;
  label: string;
  placeholder: string;
  /** The faces that show this field (all when unset): Serif and Sans bring their own font,
   * weight and letter spacing; word spacing is the reader's on Sans and Custom. */
  shownOn?: ReadingFace[];
}

interface FieldGroup {
  section: AppearanceSection;
  title: string;
  column: 'left' | 'right';
  fields: FieldConfig[];
  previewText?: string;
  /** The box offers the reading faces (Serif / Sans / Custom). */
  faces?: boolean;
}

const FACE_ITEMS: { value: ReadingFace; label: string }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'custom', label: 'Custom' },
];

const WORD_SPACING_FIELD: FieldConfig = {
  property: 'wordSpacing',
  label: 'Word Spacing:',
  placeholder: 'e.g., normal, -0.05em (tighter), 0.1em (wider)',
  shownOn: ['sans', 'custom'],
};

const WEIGHT_FIELD: FieldConfig = {
  property: 'fontWeight',
  label: 'Weight:',
  placeholder: 'e.g., 400, 450, 500',
  shownOn: ['custom'],
};

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
    faces: true,
    fields: [
      {
        property: 'fontFamily',
        label: 'Font:',
        placeholder: 'e.g., Literata, "Times New Roman", serif',
        shownOn: ['custom'],
      },
      WEIGHT_FIELD,
      {
        property: 'letterSpacing',
        label: 'Letter Spacing:',
        placeholder: LETTER_SPACING_PLACEHOLDER,
        shownOn: ['custom'],
      },
      WORD_SPACING_FIELD,
      { property: 'fontSize', label: 'Size:', placeholder: FONT_SIZE_PLACEHOLDER },
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
    faces: true,
    fields: [
      {
        property: 'fontFamily',
        label: 'Font:',
        placeholder: 'e.g., Literata, Arial, sans-serif',
        shownOn: ['custom'],
      },
      WEIGHT_FIELD,
      {
        property: 'letterSpacing',
        label: 'Letter Spacing:',
        placeholder: LETTER_SPACING_PLACEHOLDER,
        shownOn: ['custom'],
      },
      WORD_SPACING_FIELD,
      { property: 'fontSize', label: 'Size:', placeholder: FONT_SIZE_PLACEHOLDER },
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
  onFaceChange: (section: AppearanceSection, face: ReadingFace) => void;
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
  onFaceChange,
  follows,
  extraRows,
}: FontControlGroupProps) {
  const sectionValues = appearance[group.section] as unknown as Record<string, string | undefined>;
  // A box without a saved face (a fixture, or a section that has none) shows every field.
  const face = group.faces ? (sectionValues.face as ReadingFace | undefined) : undefined;
  // Following another section disables this one's rows. The kit group's fieldset already
  // does; each row also says so itself, so its field and reset button read disabled
  // wherever a <fieldset disabled> is not honoured (happy-dom).
  const disabled = follows?.checked ?? false;

  return (
    <SettingGroup title={group.title} follows={follows}>
      {group.faces && (
        // A group row only fades its label (kit SettingRow): the control is disabled itself.
        <SettingRow group label="Face:">
          <SegmentedControl<ReadingFace>
            aria-label="Face"
            items={FACE_ITEMS}
            value={face ?? 'custom'}
            disabled={disabled}
            onValueChange={(value) => onFaceChange(group.section, value)}
          />
        </SettingRow>
      )}
      {group.fields.map((field) => {
        if (field.shownOn && face !== undefined && !field.shownOn.includes(face)) return null;
        const raw = sectionValues[field.property];
        const value =
          field.property === 'paragraphSpacing'
            ? (raw ?? '1rem')
            : field.property === 'fontWeight'
              ? (raw ?? '400')
              : field.property === 'wordSpacing'
                ? (raw ?? 'normal')
                : (raw ?? '');
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
            ...resolveReadingType(appearance[group.section] as FontSettings),
            fontSize: sectionValues.fontSize,
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
    handleFaceChange,
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
              onFaceChange={(section, face) => void handleFaceChange(section, face)}
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
              onFaceChange={(section, face) => void handleFaceChange(section, face)}
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

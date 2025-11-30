/**
 * UI and styling types for the application
 *
 * Provides type definitions for theming, layout, colors, and UI components.
 * Enables type-safe UI development without migrating existing components.
 *
 * Usage in .jsx files:
 * @typedef {import('./types/UITypes').Theme} Theme
 * @param {Theme} theme
 */

// =============================================================================
// Theme Types
// =============================================================================

/**
 * Application theme options
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * Resolved color scheme (auto becomes light or dark)
 */
export type ColorScheme = 'light' | 'dark';

/**
 * Complete theme color palette
 */
export interface ThemeColors {
  // Background colors
  /** Primary background color */
  background: string;
  /** Secondary background color (panels, cards) */
  backgroundSecondary: string;
  /** Tertiary background color (hover states) */
  backgroundTertiary: string;

  // Text colors
  /** Primary text color */
  text: string;
  /** Secondary text color (descriptions, labels) */
  textSecondary: string;
  /** Tertiary text color (placeholders, disabled) */
  textTertiary: string;

  // Border colors
  /** Default border color */
  border: string;
  /** Border color on hover */
  borderHover: string;
  /** Focused element border color */
  borderFocus: string;

  // Accent colors
  /** Primary accent color */
  primary: string;
  /** Secondary accent color */
  secondary: string;
  /** Success state color */
  success: string;
  /** Warning state color */
  warning: string;
  /** Error state color */
  error: string;
  /** Info state color */
  info: string;

  // Component-specific colors
  /** Navigation bar background */
  navBg: string;
  /** Navigation bar text */
  navText: string;
  /** Navigation bar hover state */
  navHover: string;
  /** Active navigation item */
  navActive: string;
  /** Primary button background */
  buttonPrimary: string;
  /** Secondary button background */
  buttonSecondary: string;
  /** Button hover background */
  buttonHover: string;
  /** Highlight background (selected text, active items) */
  highlightBg: string;
  /** Highlight text color */
  highlightText: string;

  // Streaming/progress colors
  /** Streaming background primary */
  streamingBgPrimary: string;
  /** Streaming background secondary */
  streamingBgSecondary: string;
  /** Streaming accent color */
  streamingAccent: string;
  /** Streaming accent light variant */
  streamingAccentLight: string;
  /** Streaming border color */
  streamingBorder: string;
  /** Streaming text primary */
  streamingTextPrimary: string;
}

/**
 * CSS custom properties mapping for theme
 */
export interface CSSVariables extends Record<string, string> {
  '--background-color': string;
  '--background-secondary': string;
  '--text-color': string;
  '--text-secondary': string;
  '--border-color': string;
  '--nav-bg': string;
  '--nav-text': string;
  '--nav-active': string;
  // ... extensible for all theme variables
}

// =============================================================================
// Text Sizing Types
// =============================================================================

/**
 * Predefined text size options
 */
export type TextSize = 'small' | 'medium' | 'large' | 'huge';

/**
 * Text size to CSS value mapping
 */
export interface TextSizeMapping {
  /** Small text size (e.g., '0.875rem' or '14px') */
  small: string;
  /** Medium/default text size (e.g., '1rem' or '16px') */
  medium: string;
  /** Large text size (e.g., '1.25rem' or '20px') */
  large: string;
  /** Huge text size (e.g., '1.5rem' or '24px') */
  huge: string;
}

/**
 * Font weight options
 */
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold' | number;

/**
 * Line height options
 */
export type LineHeight = 'tight' | 'normal' | 'relaxed' | 'loose' | number | string;

// =============================================================================
// Layout Types
// =============================================================================

/**
 * Layout mode for translation panels
 */
export type LayoutMode = 'horizontal' | 'vertical' | 'grid';

/**
 * Layout configuration
 */
export interface LayoutConfig {
  /** Layout mode */
  mode: LayoutMode;
  /** Panel size ratio (0.0 to 1.0) */
  panelRatio: number;
  /** Show original Chinese text panel */
  showOriginal: boolean;
  /** Show character-only translation panel */
  showCharacterOnly: boolean;
  /** Show full translation panel */
  showTranslation: boolean;
  /** Reverse panel order */
  reversePanels?: boolean;
}

/**
 * Responsive breakpoints
 */
export interface Breakpoints {
  /** Extra small devices (< 640px) */
  xs: number;
  /** Small devices (>= 640px) */
  sm: number;
  /** Medium devices (>= 768px) */
  md: number;
  /** Large devices (>= 1024px) */
  lg: number;
  /** Extra large devices (>= 1280px) */
  xl: number;
  /** 2XL devices (>= 1536px) */
  xxl: number;
}

/**
 * Current viewport size category
 */
export type ViewportSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

// =============================================================================
// Keyboard Shortcut Types
// =============================================================================

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** Key identifier (e.g., 'r', '1', 'ArrowUp') */
  key: string;
  /** Requires Ctrl key (Windows/Linux) */
  ctrl?: boolean;
  /** Requires Shift key */
  shift?: boolean;
  /** Requires Alt key */
  alt?: boolean;
  /** Requires Meta/Command key (macOS) */
  meta?: boolean;
  /** Human-readable description */
  description: string;
  /** Action to perform when shortcut is triggered */
  action: () => void | Promise<void>;
  /** Whether shortcut is currently enabled */
  enabled?: boolean;
  /** Group/category for organization */
  group?: string;
  /** Platform-specific (only active on specific OS) */
  platform?: 'mac' | 'windows' | 'linux' | 'all';
}

/**
 * Keyboard shortcut group
 */
export interface ShortcutGroup {
  /** Group identifier */
  id: string;
  /** Group display name */
  name: string;
  /** Shortcuts in this group */
  shortcuts: KeyboardShortcut[];
  /** Whether entire group is enabled */
  enabled?: boolean;
}

// =============================================================================
// Modal & Dialog Types
// =============================================================================

/**
 * Modal size options
 */
export type ModalSize = 'small' | 'medium' | 'large' | 'fullscreen';

/**
 * Modal configuration
 */
export interface ModalConfig {
  /** Modal title */
  title: string;
  /** Modal content (React nodes) */
  content: React.ReactNode;
  /** Close handler */
  onClose: () => void;
  /** Confirm handler (optional) */
  onConfirm?: () => void | Promise<void>;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Modal size */
  size?: ModalSize;
  /** Show close button in header */
  showCloseButton?: boolean;
  /** Click outside modal to close */
  closeOnOutsideClick?: boolean;
  /** Press Escape key to close */
  closeOnEscape?: boolean;
  /** Show footer buttons */
  showFooter?: boolean;
  /** Custom footer content */
  footer?: React.ReactNode;
  /** Custom width (CSS value) */
  width?: string;
  /** Custom max width (CSS value) */
  maxWidth?: string;
}

/**
 * Tooltip position
 */
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Tooltip configuration
 */
export interface TooltipConfig {
  /** Tooltip text content */
  content: string | React.ReactNode;
  /** Position relative to target */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
  /** Custom styles */
  style?: React.CSSProperties;
}

// =============================================================================
// Animation Types
// =============================================================================

/**
 * Animation timing function
 */
export type AnimationTiming = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

/**
 * Animation configuration
 */
export interface AnimationConfig {
  /** Animation duration (ms or CSS value) */
  duration: number | string;
  /** Timing function */
  timing?: AnimationTiming;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** Number of iterations ('infinite' or number) */
  iterations?: number | 'infinite';
  /** Animation direction */
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

/**
 * Transition configuration
 */
export interface TransitionConfig {
  /** CSS property to transition */
  property: string | string[];
  /** Duration (ms or CSS value) */
  duration: number | string;
  /** Timing function */
  timing?: AnimationTiming;
  /** Delay (ms) */
  delay?: number;
}

// =============================================================================
// Loading & Spinner Types
// =============================================================================

/**
 * Spinner size
 */
export type SpinnerSize = 'small' | 'medium' | 'large';

/**
 * Loading state display mode
 */
export type LoadingMode = 'spinner' | 'skeleton' | 'overlay' | 'inline';

/**
 * Loading overlay configuration
 */
export interface LoadingOverlayConfig {
  /** Whether overlay is visible */
  visible: boolean;
  /** Loading message text */
  message?: string;
  /** Spinner size */
  size?: SpinnerSize;
  /** Custom spinner component */
  spinner?: React.ReactNode;
  /** Whether to blur background */
  blur?: boolean;
  /** Overlay opacity (0-1) */
  opacity?: number;
}

// =============================================================================
// Notification Types
// =============================================================================

/**
 * Notification type/severity
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Notification position on screen
 */
export type NotificationPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Notification configuration
 */
export interface NotificationConfig {
  /** Notification ID */
  id: string;
  /** Notification type */
  type: NotificationType;
  /** Title text */
  title?: string;
  /** Message text */
  message: string;
  /** Auto-dismiss duration (ms, 0 = no auto-dismiss) */
  duration?: number;
  /** Screen position */
  position?: NotificationPosition;
  /** Whether notification can be dismissed */
  dismissible?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Action buttons */
  actions?: NotificationAction[];
}

/**
 * Notification action button
 */
export interface NotificationAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'text';
}

// =============================================================================
// Progress & Status Types
// =============================================================================

/**
 * Progress bar variant
 */
export type ProgressVariant = 'determinate' | 'indeterminate' | 'buffer';

/**
 * Progress bar configuration
 */
export interface ProgressConfig {
  /** Current progress value (0-100) */
  value: number;
  /** Buffer value for buffer variant (0-100) */
  bufferValue?: number;
  /** Progress variant */
  variant?: ProgressVariant;
  /** Show percentage label */
  showLabel?: boolean;
  /** Custom label text */
  label?: string;
  /** Color variant */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  /** Height of progress bar (CSS value) */
  height?: string;
  /** Whether progress is animated */
  animated?: boolean;
}

/**
 * Status badge variant
 */
export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Status badge configuration
 */
export interface StatusBadge {
  /** Status text */
  label: string;
  /** Status variant */
  variant: StatusVariant;
  /** Show pulsing indicator */
  pulse?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
}

// =============================================================================
// Export all types
// =============================================================================

export {};

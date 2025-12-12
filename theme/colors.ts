// ============================================================================
// COLORS - Default Theme Export
// This file exports the default Cyan Core theme colors for backward compatibility
// For full theme support, use the ThemeProvider and useTheme hook
// ============================================================================

import { defaultTheme } from './themes';

// Export the default theme colors for backward compatibility
// These will be used when components haven't been migrated to useTheme yet
export const colors = {
  // Core backgrounds
  background: defaultTheme.colors.void,
  backgroundSecondary: defaultTheme.colors.surface,
  backgroundTertiary: defaultTheme.colors.surfaceAlt,

  // Primary accent
  primary: defaultTheme.colors.primary,
  primaryDark: defaultTheme.colors.secondary,
  primaryLight: defaultTheme.colors.primaryMuted,

  // Text
  textPrimary: defaultTheme.colors.textPrimary,
  textSecondary: defaultTheme.colors.textSecondary,
  textMuted: defaultTheme.colors.textMuted,

  // Borders
  border: defaultTheme.colors.border,
  borderLight: defaultTheme.colors.tileBorder,

  // Status colors
  success: defaultTheme.colors.success,
  error: defaultTheme.colors.error,
  warning: defaultTheme.colors.warning,
  info: defaultTheme.colors.primary,

  // UI Elements
  inputBackground: defaultTheme.colors.inputBackground,
  buttonBackground: defaultTheme.colors.buttonBackground,
  cardBackground: defaultTheme.colors.surface,
  surface: defaultTheme.colors.surface,

  // Overlays
  overlay: defaultTheme.colors.overlay,

  // Accent
  accent: defaultTheme.colors.accent,
  skipButtonAccent: defaultTheme.colors.skipButtonAccent,

  // Glow
  glow: defaultTheme.colors.glow,
};

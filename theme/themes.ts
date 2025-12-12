// ============================================================================
// THEME SYSTEM - 10 Dark Sci-Fi Themes
// All themes maintain dark mysterious aesthetic with distinct glow colors
// Surface colors are kept consistent for the dark sci-fi look
// Ported from CountOnMe for consistent styling
// ============================================================================

export interface Theme {
  id: string;
  name: string;
  colors: {
    // Core backgrounds - consistent dark base across all themes
    void: string;           // Deepest background
    surface: string;        // Elevated surfaces (tiles, cards)
    surfaceAlt: string;     // Alternative surface color

    // Accent colors - subtle variations per theme
    primary: string;        // Main accent color
    primaryMuted: string;   // Muted version of primary
    secondary: string;      // Secondary accent

    // Text colors - consistent for readability
    textPrimary: string;    // Main text color
    textSecondary: string;  // Secondary text
    textMuted: string;      // Muted/disabled text

    // UI elements
    border: string;         // Default borders
    borderActive: string;   // Active/selected borders
    glow: string;           // Glow effects - main differentiator

    // Semantic colors
    success: string;
    warning: string;
    error: string;

    // Component specific
    buttonBackground: string;
    buttonBorder: string;
    tileBackground: string;
    tileBorder: string;
    listTileBackground: string;
    inputBackground: string;
    inputBorder: string;

    // Progress/Timer specific
    progressTrack: string;
    progressFill: string;
    timerActive: string;
    timerBreak: string;

    // Selection highlight
    selectedHighlight: string;

    // Additional UI colors
    overlay: string;
    accent: string;
    skipButtonAccent: string;
  };
}

// Shared dark base colors for consistency
const darkBase = {
  void: '#0c1014',
  surface: 'rgba(28, 38, 48, 0.95)',
  surfaceAlt: 'rgba(18, 26, 34, 0.9)',
  textPrimary: '#e8eaec',
  textSecondary: 'rgb(180, 190, 198)',
  border: '#242c34',
  buttonBackground: 'rgba(28, 38, 48, 0.95)',
  tileBackground: 'rgba(16, 22, 28, 0.92)',
  tileBorder: '#1e262e',
  listTileBackground: 'rgba(20, 28, 36, 1)',
  inputBackground: 'transparent',
  inputBorder: 'rgb(60, 70, 80)',
  progressTrack: '#1e262e',
  overlay: 'rgba(0, 0, 0, 0.85)',
};

// 1. Cyan Core (Default - cyan glow) - Same as CountOnMe
export const originalDark: Theme = {
  id: 'original-dark',
  name: 'Cyan Core',
  colors: {
    ...darkBase,
    primary: 'rgb(42, 199, 207)',
    primaryMuted: 'rgba(42, 199, 207, 0.4)',
    secondary: 'rgb(30, 80, 90)',
    textMuted: 'rgb(120, 160, 170)',
    borderActive: 'rgb(42, 199, 207)',
    glow: 'rgb(42, 199, 207)',
    success: '#4caf50',
    warning: '#f0ad4e',
    error: '#ef5350',
    buttonBorder: 'rgb(50, 70, 80)',
    progressFill: 'rgb(42, 199, 207)',
    timerActive: '#4caf50',
    timerBreak: '#ef5350',
    selectedHighlight: 'rgba(42, 199, 207, 0.12)',
    accent: 'rgb(42, 199, 207)',
    skipButtonAccent: '#F715AB',
  },
};

// 2. Azure Pulse (Blue glow)
export const midnightBlue: Theme = {
  id: 'midnight-blue',
  name: 'Azure Pulse',
  colors: {
    ...darkBase,
    primary: '#4da6ff',
    primaryMuted: 'rgba(77, 166, 255, 0.4)',
    secondary: 'rgb(30, 55, 85)',
    textMuted: 'rgb(110, 145, 180)',
    borderActive: '#4da6ff',
    glow: 'rgb(77, 166, 255)',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
    buttonBorder: 'rgb(45, 65, 90)',
    progressFill: '#4da6ff',
    timerActive: '#4caf50',
    timerBreak: '#f44336',
    selectedHighlight: 'rgba(77, 166, 255, 0.12)',
    accent: '#4da6ff',
    skipButtonAccent: '#F715AB',
  },
};

// 3. Violet Nexus (Purple glow)
export const cyberPurple: Theme = {
  id: 'cyber-purple',
  name: 'Violet Nexus',
  colors: {
    ...darkBase,
    primary: '#a855f7',
    primaryMuted: 'rgba(168, 85, 247, 0.4)',
    secondary: 'rgb(50, 35, 75)',
    textMuted: 'rgb(140, 120, 170)',
    borderActive: '#a855f7',
    glow: 'rgb(168, 85, 247)',
    success: '#66bb6a',
    warning: '#ffa726',
    error: '#ef5350',
    buttonBorder: 'rgb(60, 50, 85)',
    progressFill: '#a855f7',
    timerActive: '#66bb6a',
    timerBreak: '#ef5350',
    selectedHighlight: 'rgba(168, 85, 247, 0.12)',
    accent: '#a855f7',
    skipButtonAccent: '#F715AB',
  },
};

// 4. Reactor Green (Green glow)
export const neonGreen: Theme = {
  id: 'neon-green',
  name: 'Reactor Green',
  colors: {
    ...darkBase,
    primary: '#22c55e',
    primaryMuted: 'rgba(34, 197, 94, 0.4)',
    secondary: 'rgb(30, 55, 40)',
    textMuted: 'rgb(100, 150, 120)',
    borderActive: '#22c55e',
    glow: 'rgb(34, 197, 94)',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    buttonBorder: 'rgb(45, 70, 55)',
    progressFill: '#22c55e',
    timerActive: '#22c55e',
    timerBreak: '#ef4444',
    selectedHighlight: 'rgba(34, 197, 94, 0.12)',
    accent: '#22c55e',
    skipButtonAccent: '#F715AB',
  },
};

// 5. Crimson Flare (Red glow)
export const crimsonNight: Theme = {
  id: 'crimson-night',
  name: 'Crimson Flare',
  colors: {
    ...darkBase,
    primary: '#ef4444',
    primaryMuted: 'rgba(239, 68, 68, 0.4)',
    secondary: 'rgb(65, 35, 40)',
    textMuted: 'rgb(160, 120, 130)',
    borderActive: '#ef4444',
    glow: 'rgb(239, 68, 68)',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    buttonBorder: 'rgb(80, 50, 55)',
    progressFill: '#ef4444',
    timerActive: '#22c55e',
    timerBreak: '#ef4444',
    selectedHighlight: 'rgba(239, 68, 68, 0.12)',
    accent: '#ef4444',
    skipButtonAccent: '#F715AB',
  },
};

// 6. Deep Teal (Teal glow)
export const oceanDepths: Theme = {
  id: 'ocean-depths',
  name: 'Deep Teal',
  colors: {
    ...darkBase,
    primary: '#14b8a6',
    primaryMuted: 'rgba(20, 184, 166, 0.4)',
    secondary: 'rgb(25, 55, 55)',
    textMuted: 'rgb(100, 150, 150)',
    borderActive: '#14b8a6',
    glow: 'rgb(20, 184, 166)',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    buttonBorder: 'rgb(40, 70, 70)',
    progressFill: '#14b8a6',
    timerActive: '#22c55e',
    timerBreak: '#ef4444',
    selectedHighlight: 'rgba(20, 184, 166, 0.12)',
    accent: '#14b8a6',
    skipButtonAccent: '#F715AB',
  },
};

// 7. Amber Signal (Orange/Gold glow)
export const goldenHour: Theme = {
  id: 'golden-hour',
  name: 'Amber Signal',
  colors: {
    ...darkBase,
    primary: '#f59e0b',
    primaryMuted: 'rgba(245, 158, 11, 0.4)',
    secondary: 'rgb(55, 45, 30)',
    textMuted: 'rgb(160, 140, 110)',
    borderActive: '#f59e0b',
    glow: 'rgb(245, 158, 11)',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    buttonBorder: 'rgb(75, 60, 45)',
    progressFill: '#f59e0b',
    timerActive: '#22c55e',
    timerBreak: '#ef4444',
    selectedHighlight: 'rgba(245, 158, 11, 0.12)',
    accent: '#f59e0b',
    skipButtonAccent: '#F715AB',
  },
};

// 8. Ice Blue (Light blue/white glow)
export const arcticFrost: Theme = {
  id: 'arctic-frost',
  name: 'Ice Blue',
  colors: {
    ...darkBase,
    primary: '#7dd3fc',
    primaryMuted: 'rgba(125, 211, 252, 0.4)',
    secondary: 'rgb(40, 55, 65)',
    textMuted: 'rgb(130, 160, 180)',
    borderActive: '#7dd3fc',
    glow: 'rgb(125, 211, 252)',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    buttonBorder: 'rgb(55, 70, 85)',
    progressFill: '#7dd3fc',
    timerActive: '#4ade80',
    timerBreak: '#f87171',
    selectedHighlight: 'rgba(125, 211, 252, 0.12)',
    accent: '#7dd3fc',
    skipButtonAccent: '#F715AB',
  },
};

// 9. Magma Core (Orange-red glow)
export const emberGlow: Theme = {
  id: 'ember-glow',
  name: 'Magma Core',
  colors: {
    ...darkBase,
    primary: '#f97316',
    primaryMuted: 'rgba(249, 115, 22, 0.4)',
    secondary: 'rgb(60, 40, 30)',
    textMuted: 'rgb(160, 130, 110)',
    borderActive: '#f97316',
    glow: 'rgb(249, 115, 22)',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    buttonBorder: 'rgb(80, 55, 40)',
    progressFill: '#f97316',
    timerActive: '#22c55e',
    timerBreak: '#ef4444',
    selectedHighlight: 'rgba(249, 115, 22, 0.12)',
    accent: '#f97316',
    skipButtonAccent: '#F715AB',
  },
};

// 10. Ghost Protocol (Minimal white/gray glow)
export const stealthMode: Theme = {
  id: 'stealth-mode',
  name: 'Ghost Protocol',
  colors: {
    ...darkBase,
    void: '#08090a',
    surface: 'rgba(22, 26, 30, 0.95)',
    surfaceAlt: 'rgba(14, 18, 22, 0.9)',
    primary: '#94a3b8',
    primaryMuted: 'rgba(148, 163, 184, 0.4)',
    secondary: 'rgb(40, 45, 50)',
    textMuted: 'rgb(100, 110, 120)',
    border: '#1e2228',
    borderActive: '#94a3b8',
    glow: 'rgb(148, 163, 184)',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    buttonBackground: 'rgba(22, 26, 30, 0.95)',
    buttonBorder: 'rgb(50, 55, 62)',
    tileBackground: 'rgba(12, 16, 20, 0.92)',
    tileBorder: '#181c22',
    listTileBackground: 'rgba(16, 20, 24, 1)',
    progressTrack: '#181c22',
    progressFill: '#94a3b8',
    timerActive: '#4ade80',
    timerBreak: '#f87171',
    selectedHighlight: 'rgba(148, 163, 184, 0.1)',
    overlay: 'rgba(0, 0, 0, 0.85)',
    accent: '#94a3b8',
    skipButtonAccent: '#F715AB',
  },
};

// Export all themes as an array
export const themes: Theme[] = [
  originalDark,
  midnightBlue,
  cyberPurple,
  neonGreen,
  crimsonNight,
  oceanDepths,
  goldenHour,
  arcticFrost,
  emberGlow,
  stealthMode,
];

// Get theme by ID
export const getThemeById = (id: string): Theme => {
  return themes.find(t => t.id === id) || originalDark;
};

// Default theme
export const defaultTheme = originalDark;

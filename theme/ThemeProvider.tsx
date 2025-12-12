import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { defaultTheme, getThemeById, Theme, themes } from './themes';

// ============================================================================
// THEME PROVIDER
// Manages app-wide theming with persistence
// Ported from CountOnMe for consistent styling
// ============================================================================

const THEME_STORAGE_KEY = '@mymix_theme';

interface ThemeContextType {
  // Theme
  theme: Theme;
  themes: Theme[];
  setTheme: (themeId: string) => Promise<void>;

  // Loading state
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const savedThemeId = await AsyncStorage.getItem(THEME_STORAGE_KEY);

        if (savedThemeId) {
          const theme = getThemeById(savedThemeId);
          setCurrentTheme(theme);
        }
      } catch (error) {
        console.error('Failed to load theme preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const setTheme = useCallback(async (themeId: string) => {
    try {
      const newTheme = getThemeById(themeId);
      setCurrentTheme(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, []);

  const contextValue: ThemeContextType = {
    theme: currentTheme,
    themes,
    setTheme,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// THEMED STYLE HELPERS
// Helper functions to create consistent themed styles
// ============================================================================

export const createThemedStyles = (theme: Theme) => ({
  // Container styles
  container: {
    backgroundColor: theme.colors.void,
  },
  surface: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  tile: {
    backgroundColor: theme.colors.tileBackground,
    borderColor: theme.colors.tileBorder,
  },

  // Text styles
  textPrimary: {
    color: theme.colors.textPrimary,
  },
  textSecondary: {
    color: theme.colors.textSecondary,
  },
  textMuted: {
    color: theme.colors.textMuted,
  },
  textAccent: {
    color: theme.colors.primary,
  },

  // Button styles
  button: {
    backgroundColor: theme.colors.buttonBackground,
    borderColor: theme.colors.buttonBorder,
  },
  buttonActive: {
    borderColor: theme.colors.borderActive,
    shadowColor: theme.colors.glow,
  },

  // Input styles
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.inputBorder,
    color: theme.colors.textPrimary,
  },

  // Border styles
  border: {
    borderColor: theme.colors.border,
  },
  borderActive: {
    borderColor: theme.colors.borderActive,
  },

  // Glow effect
  glow: {
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

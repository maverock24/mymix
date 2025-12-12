import React, { useRef } from 'react';
import {
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

// ============================================================================
// ANIMATED BUTTON
// Button component with spring animation on press, matching CountOnMe's style
// ============================================================================

interface AnimatedButtonProps {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  activeOpacity?: number;
  withGlow?: boolean;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  onPress,
  onLongPress,
  style,
  children,
  disabled = false,
  withGlow = false,
  hitSlop,
}) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const glowStyle = withGlow
    ? {
        shadowColor: theme.colors.glow,
        shadowOpacity: 0.6,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      }
    : {};

  return (
    <TouchableWithoutFeedback
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      hitSlop={hitSlop}
    >
      <Animated.View
        style={[
          style,
          glowStyle,
          {
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// ============================================================================
// PLAY BUTTON
// Specialized play button with CountOnMe's skewed parallelogram style
// ============================================================================

interface PlayButtonProps {
  onPress?: () => void;
  isPlaying: boolean;
  isLoading?: boolean;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

export const PlayButton: React.FC<PlayButtonProps> = ({
  onPress,
  isPlaying,
  isLoading = false,
  size = 'medium',
  disabled = false,
}) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const sizeStyles = {
    small: { width: 56, height: 56, fontSize: 28 },
    medium: { width: 72, height: 72, fontSize: 36 },
    large: { width: 90, height: 90, fontSize: 40 },
  };

  const currentSize = sizeStyles[size];

  return (
    <TouchableWithoutFeedback
      onPress={disabled || isLoading ? undefined : onPress}
      onPressIn={disabled || isLoading ? undefined : handlePressIn}
      onPressOut={disabled || isLoading ? undefined : handlePressOut}
    >
      <Animated.View
        style={[
          styles.playButton,
          {
            width: currentSize.width,
            height: currentSize.height,
            backgroundColor: theme.colors.void,
            borderColor: theme.colors.void,
            shadowColor: theme.colors.glow,
            transform: [{ scale: scaleAnim }, { skewX: '-12deg' }],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.playButtonText,
            {
              fontSize: currentSize.fontSize,
              color: theme.colors.primary,
              transform: [{ skewX: '12deg' }],
            },
          ]}
        >
          {isLoading ? '◌' : isPlaying ? '▮▮' : '▶'}
        </Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// ============================================================================
// CONTROL BUTTON
// Smaller control button with skewed style for prev/next/shuffle/repeat
// ============================================================================

interface ControlButtonProps {
  onPress?: () => void;
  icon: string;
  isActive?: boolean;
  disabled?: boolean;
}

export const ControlButton: React.FC<ControlButtonProps> = ({
  onPress,
  icon,
  isActive = false,
  disabled = false,
}) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
    >
      <Animated.View
        style={[
          styles.controlButton,
          {
            backgroundColor: theme.colors.void,
            borderColor: isActive ? theme.colors.primary : theme.colors.void,
            transform: [{ scale: scaleAnim }, { skewX: '-12deg' }],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.controlButtonText,
            {
              color: isActive ? theme.colors.primary : theme.colors.skipButtonAccent,
              transform: [{ skewX: '12deg' }],
            },
          ]}
        >
          {icon}
        </Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// ============================================================================
// SKIP BUTTON
// Skip button for +/- seconds with skewed style
// ============================================================================

interface SkipButtonProps {
  onPress?: () => void;
  label: string;
  disabled?: boolean;
}

export const SkipButton: React.FC<SkipButtonProps> = ({
  onPress,
  label,
  disabled = false,
}) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
    >
      <Animated.View
        style={[
          styles.skipButton,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            transform: [{ scale: scaleAnim }, { skewX: '-12deg' }],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.skipButtonText,
            {
              color: theme.colors.textPrimary,
              transform: [{ skewX: '12deg' }],
            },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  playButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 3,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  playButtonText: {
    fontWeight: 'bold',
  },
  controlButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 2,
  },
  controlButtonText: {
    fontSize: 24,
  },
  skipButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 0,
    borderWidth: 2,
    minWidth: 90,
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

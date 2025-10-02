import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';

interface TrackControlsProps {
  trackTitle: string;
  trackName: string;
  volume: number;
  rate: number;
  position: number;
  duration: number;
  onVolumeChange: (value: number) => void;
  onVolumeComplete: (value: number) => void;
  onRateChange: (value: number) => void;
  onRateComplete: (value: number) => void;
  formatTime: (millis: number) => string;
  showPositionSlider?: boolean;
  onPositionChange?: (value: number) => void;
  onPositionComplete?: (value: number) => void;
}

export const TrackControls = memo<TrackControlsProps>(({
  trackTitle,
  trackName,
  volume,
  rate,
  position,
  duration,
  onVolumeChange,
  onVolumeComplete,
  onRateChange,
  onRateComplete,
  formatTime,
  showPositionSlider = false,
  onPositionChange,
  onPositionComplete,
}) => {
  return (
    <View style={styles.trackContainer}>
      <Text style={styles.trackTitle}>{trackTitle}</Text>
      <Text style={styles.trackName}>{trackName}</Text>

      {showPositionSlider && onPositionChange && onPositionComplete && (
        <View style={styles.controlRow}>
          <Text style={styles.label}>Position: {formatTime(position)} / {formatTime(duration)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={position}
            onValueChange={onPositionChange}
            onSlidingComplete={onPositionComplete}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
        </View>
      )}

      <View style={styles.controlRow}>
        <Text style={styles.label}>Volume: {Math.round(volume * 100)}%</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={volume}
          onValueChange={onVolumeChange}
          onSlidingComplete={onVolumeComplete}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.controlRow}>
        <Text style={styles.label}>Speed: {rate.toFixed(2)}x</Text>
        <Slider
          style={styles.slider}
          minimumValue={0.5}
          maximumValue={2.0}
          value={rate}
          onValueChange={onRateChange}
          onSlidingComplete={onRateComplete}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
      </View>

      {!showPositionSlider && (
        <Text style={styles.time}>
          {formatTime(position)} / {formatTime(duration)}
        </Text>
      )}
    </View>
  );
});

TrackControls.displayName = 'TrackControls';

const styles = StyleSheet.create({
  trackContainer: {
    marginBottom: 20,
    padding: 18,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: colors.textPrimary,
  },
  trackName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 15,
  },
  controlRow: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
});

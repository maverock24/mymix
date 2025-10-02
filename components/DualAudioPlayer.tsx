import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { AudioPair, StorageService } from '../services/storage';
import { TrackControls } from './TrackControls';
import { colors } from '../theme/colors';

interface DualAudioPlayerProps {
  audioPair: AudioPair;
}

export const DualAudioPlayer: React.FC<DualAudioPlayerProps> = ({ audioPair }) => {
  const [sound1, setSound1] = useState<Audio.Sound | null>(null);
  const [sound2, setSound2] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Volume states (0 to 1) - Load from saved settings or use defaults
  const [volume1, setVolume1] = useState(audioPair.bgMusicVolume ?? 0.25);
  const [volume2, setVolume2] = useState(audioPair.audiobookVolume ?? 1);

  // Speed/Rate states (0.5 to 2.0) - Load from saved settings or use defaults
  const [rate1, setRate1] = useState(audioPair.bgMusicSpeed ?? 1);
  const [rate2, setRate2] = useState(audioPair.audiobookSpeed ?? 1);

  // Position states - throttled updates
  const [position1, setPosition1] = useState(0);
  const [position2, setPosition2] = useState(0);
  const [duration1, setDuration1] = useState(0);
  const [duration2, setDuration2] = useState(0);

  // Refs for throttling position updates
  const lastPositionUpdate1 = useRef(0);
  const lastPositionUpdate2 = useRef(0);
  const POSITION_UPDATE_INTERVAL = 500; // Update position every 500ms instead of constantly
  const POSITION_SAVE_INTERVAL = 5000; // Save position every 5 seconds
  const positionSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Refs for Blob URLs - need to revoke them when done
  const blobUrl1 = useRef<string | null>(null);
  const blobUrl2 = useRef<string | null>(null);

  useEffect(() => {
    loadAudio();
    return () => {
      saveCurrentPosition();
      if (positionSaveTimer.current) {
        clearInterval(positionSaveTimer.current);
      }
      unloadAudio();
      // Revoke blob URLs to free memory
      if (blobUrl1.current) {
        URL.revokeObjectURL(blobUrl1.current);
      }
      if (blobUrl2.current) {
        URL.revokeObjectURL(blobUrl2.current);
      }
    };
  }, [audioPair]);

  // Auto-save position every 5 seconds when playing
  useEffect(() => {
    if (isPlaying) {
      positionSaveTimer.current = setInterval(() => {
        saveCurrentPosition();
      }, POSITION_SAVE_INTERVAL);
    } else {
      if (positionSaveTimer.current) {
        clearInterval(positionSaveTimer.current);
      }
      saveCurrentPosition();
    }

    return () => {
      if (positionSaveTimer.current) {
        clearInterval(positionSaveTimer.current);
      }
    };
  }, [isPlaying, position2]);

  const saveCurrentPosition = useCallback(async () => {
    if (position2 > 0) {
      await StorageService.savePosition(audioPair.id, position2);
    }
  }, [position2, audioPair.id]);

  const saveSettings = useCallback(async () => {
    await StorageService.saveSettings(audioPair.id, {
      bgMusicVolume: volume1,
      audiobookVolume: volume2,
      bgMusicSpeed: rate1,
      audiobookSpeed: rate2,
    });
  }, [audioPair.id, volume1, volume2, rate1, rate2]);

  const loadAudio = async () => {
    try {
      setIsLoading(true);
      console.log('Loading audio files...');

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Create blob URLs from blob data (much more efficient than Base64)
      console.log('Creating blob URLs...');
      blobUrl1.current = URL.createObjectURL(audioPair.backgroundMusic.data);
      blobUrl2.current = URL.createObjectURL(audioPair.audiobook.data);
      console.log('Blob URLs created');

      // Load background music with looping enabled
      console.log('Loading background music...');
      const { sound: s1 } = await Audio.Sound.createAsync(
        { uri: blobUrl1.current },
        {
          volume: volume1,
          rate: rate1,
          shouldCorrectPitch: true,
          progressUpdateIntervalMillis: POSITION_UPDATE_INTERVAL,
          isLooping: true, // Loop background music
        },
        onPlaybackStatusUpdate1
      );
      console.log('Background music loaded successfully');
      setSound1(s1);

      // Load audiobook (without initial position)
      console.log('Loading audiobook...');
      const { sound: s2 } = await Audio.Sound.createAsync(
        { uri: blobUrl2.current },
        {
          volume: volume2,
          rate: rate2,
          shouldCorrectPitch: true,
          progressUpdateIntervalMillis: POSITION_UPDATE_INTERVAL,
        },
        onPlaybackStatusUpdate2
      );
      console.log('Audiobook loaded successfully');
      setSound2(s2);

      // Restore saved position after audiobook is loaded
      if (audioPair.savedPosition && audioPair.savedPosition > 0) {
        try {
          console.log('Restoring saved position:', audioPair.savedPosition);
          await s2.setPositionAsync(audioPair.savedPosition);
          setPosition2(audioPair.savedPosition);
        } catch (error) {
          console.error('Error restoring saved position:', error);
        }
      }

      console.log('All audio files loaded successfully');
    } catch (error) {
      console.error('Error loading audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const unloadAudio = async () => {
    if (sound1) {
      await sound1.unloadAsync();
    }
    if (sound2) {
      await sound2.unloadAsync();
    }
  };

  const onPlaybackStatusUpdate1 = useCallback((status: any) => {
    if (status.isLoaded) {
      const now = Date.now();
      // Only update position if enough time has passed (throttling)
      if (now - lastPositionUpdate1.current > POSITION_UPDATE_INTERVAL) {
        setPosition1(status.positionMillis);
        lastPositionUpdate1.current = now;
      }

      // Always update duration if it changes
      if (status.durationMillis && status.durationMillis !== duration1) {
        setDuration1(status.durationMillis);
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  }, [duration1]);

  const onPlaybackStatusUpdate2 = useCallback((status: any) => {
    if (status.isLoaded) {
      const now = Date.now();
      // Only update position if enough time has passed (throttling)
      if (now - lastPositionUpdate2.current > POSITION_UPDATE_INTERVAL) {
        setPosition2(status.positionMillis);
        lastPositionUpdate2.current = now;
      }

      // Always update duration if it changes
      if (status.durationMillis && status.durationMillis !== duration2) {
        setDuration2(status.durationMillis);
      }
    }
  }, [duration2]);

  const togglePlayPause = async () => {
    if (!sound1 || !sound2) return;

    try {
      if (isPlaying) {
        await sound1.pauseAsync();
        await sound2.pauseAsync();
        setIsPlaying(false);
      } else {
        // Check if sounds are loaded before playing
        const status1 = await sound1.getStatusAsync();
        const status2 = await sound2.getStatusAsync();

        if (!status1.isLoaded || !status2.isLoaded) {
          console.error('Sounds not loaded', { sound1Loaded: status1.isLoaded, sound2Loaded: status2.isLoaded });
          return;
        }

        await sound1.playAsync();
        await sound2.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      setIsPlaying(false);
    }
  };

  const handleVolume1Change = useCallback((value: number) => {
    setVolume1(value);
  }, []);

  const handleVolume1Complete = useCallback(async (value: number) => {
    if (sound1) {
      try {
        const status = await sound1.getStatusAsync();
        if (status.isLoaded) {
          await sound1.setVolumeAsync(value);
          await saveSettings(); // Save settings after adjustment
        }
      } catch (error) {
        console.error('Error setting volume for background music:', error);
      }
    }
  }, [sound1, saveSettings]);

  const handleVolume2Change = useCallback((value: number) => {
    setVolume2(value);
  }, []);

  const handleVolume2Complete = useCallback(async (value: number) => {
    if (sound2) {
      try {
        const status = await sound2.getStatusAsync();
        if (status.isLoaded) {
          await sound2.setVolumeAsync(value);
          await saveSettings(); // Save settings after adjustment
        }
      } catch (error) {
        console.error('Error setting volume for audiobook:', error);
      }
    }
  }, [sound2, saveSettings]);

  const handleRate1Change = useCallback((value: number) => {
    setRate1(value);
  }, []);

  const handleRate1Complete = useCallback(async (value: number) => {
    if (sound1) {
      try {
        const status = await sound1.getStatusAsync();
        if (status.isLoaded) {
          await sound1.setRateAsync(value, true);
          await saveSettings(); // Save settings after adjustment
        }
      } catch (error) {
        console.error('Error setting playback rate for background music:', error);
      }
    }
  }, [sound1, saveSettings]);

  const handleRate2Change = useCallback((value: number) => {
    setRate2(value);
  }, []);

  const handleRate2Complete = useCallback(async (value: number) => {
    if (sound2) {
      try {
        const status = await sound2.getStatusAsync();
        if (status.isLoaded) {
          await sound2.setRateAsync(value, true);
          await saveSettings(); // Save settings after adjustment
        }
      } catch (error) {
        console.error('Error setting playback rate for audiobook:', error);
      }
    }
  }, [sound2, saveSettings]);

  // Position seeking handlers for audiobook
  const handlePosition2Change = useCallback((value: number) => {
    setPosition2(value);
  }, []);

  const handlePosition2Complete = useCallback(async (value: number) => {
    if (sound2) {
      try {
        const status = await sound2.getStatusAsync();
        if (status.isLoaded) {
          await sound2.setPositionAsync(value);
          await saveCurrentPosition();
        }
      } catch (error) {
        console.error('Error seeking audiobook position:', error);
      }
    }
  }, [sound2, saveCurrentPosition]);

  const formatTime = useCallback((millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading audio files...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{audioPair.name}</Text>

      <TrackControls
        trackTitle="Background Music"
        trackName={audioPair.backgroundMusic.name}
        volume={volume1}
        rate={rate1}
        position={position1}
        duration={duration1}
        onVolumeChange={handleVolume1Change}
        onVolumeComplete={handleVolume1Complete}
        onRateChange={handleRate1Change}
        onRateComplete={handleRate1Complete}
        formatTime={formatTime}
      />

      <TrackControls
        trackTitle="Audiobook"
        trackName={audioPair.audiobook.name}
        volume={volume2}
        rate={rate2}
        position={position2}
        duration={duration2}
        onVolumeChange={handleVolume2Change}
        onVolumeComplete={handleVolume2Complete}
        onRateChange={handleRate2Change}
        onRateComplete={handleRate2Complete}
        formatTime={formatTime}
        showPositionSlider={true}
        onPositionChange={handlePosition2Change}
        onPositionComplete={handlePosition2Complete}
      />

      <TouchableOpacity
        style={[styles.playButton, (!sound1 || !sound2) && styles.playButtonDisabled]}
        onPress={togglePlayPause}
        disabled={!sound1 || !sound2}
      >
        <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  playButton: {
    backgroundColor: colors.primary,
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  playButtonDisabled: {
    backgroundColor: colors.buttonBackground,
    opacity: 0.5,
  },
  playButtonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

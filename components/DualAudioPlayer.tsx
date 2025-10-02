import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Audio } from 'expo-av';
import { AudioPair } from '../services/storage';
import Slider from '@react-native-community/slider';

interface DualAudioPlayerProps {
  audioPair: AudioPair;
}

export const DualAudioPlayer: React.FC<DualAudioPlayerProps> = ({ audioPair }) => {
  const [sound1, setSound1] = useState<Audio.Sound | null>(null);
  const [sound2, setSound2] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Volume states (0 to 1)
  const [volume1, setVolume1] = useState(1);
  const [volume2, setVolume2] = useState(1);

  // Speed/Rate states (0.5 to 2.0)
  const [rate1, setRate1] = useState(1);
  const [rate2, setRate2] = useState(1);

  // Position states
  const [position1, setPosition1] = useState(0);
  const [position2, setPosition2] = useState(0);
  const [duration1, setDuration1] = useState(0);
  const [duration2, setDuration2] = useState(0);

  useEffect(() => {
    loadAudio();
    return () => {
      unloadAudio();
    };
  }, [audioPair]);

  const loadAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Load background music
      const { sound: s1 } = await Audio.Sound.createAsync(
        { uri: audioPair.backgroundMusic.data },
        { volume: volume1, rate: rate1, shouldCorrectPitch: true },
        onPlaybackStatusUpdate1
      );
      setSound1(s1);

      // Load audiobook
      const { sound: s2 } = await Audio.Sound.createAsync(
        { uri: audioPair.audiobook.data },
        { volume: volume2, rate: rate2, shouldCorrectPitch: true },
        onPlaybackStatusUpdate2
      );
      setSound2(s2);
    } catch (error) {
      console.error('Error loading audio:', error);
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

  const onPlaybackStatusUpdate1 = (status: any) => {
    if (status.isLoaded) {
      setPosition1(status.positionMillis);
      setDuration1(status.durationMillis || 0);
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  };

  const onPlaybackStatusUpdate2 = (status: any) => {
    if (status.isLoaded) {
      setPosition2(status.positionMillis);
      setDuration2(status.durationMillis || 0);
    }
  };

  const togglePlayPause = async () => {
    if (!sound1 || !sound2) return;

    if (isPlaying) {
      await sound1.pauseAsync();
      await sound2.pauseAsync();
    } else {
      await sound1.playAsync();
      await sound2.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolume1Change = async (value: number) => {
    setVolume1(value);
    if (sound1) {
      await sound1.setVolumeAsync(value);
    }
  };

  const handleVolume2Change = async (value: number) => {
    setVolume2(value);
    if (sound2) {
      await sound2.setVolumeAsync(value);
    }
  };

  const handleRate1Change = async (value: number) => {
    setRate1(value);
    if (sound1) {
      await sound1.setRateAsync(value, true);
    }
  };

  const handleRate2Change = async (value: number) => {
    setRate2(value);
    if (sound2) {
      await sound2.setRateAsync(value, true);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{audioPair.name}</Text>

      {/* Background Music Controls */}
      <View style={styles.trackContainer}>
        <Text style={styles.trackTitle}>Background Music</Text>
        <Text style={styles.trackName}>{audioPair.backgroundMusic.name}</Text>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Volume: {Math.round(volume1 * 100)}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={volume1}
            onValueChange={handleVolume1Change}
            minimumTrackTintColor="#1fb28a"
            maximumTrackTintColor="#d3d3d3"
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Speed: {rate1.toFixed(2)}x</Text>
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={2.0}
            value={rate1}
            onValueChange={handleRate1Change}
            minimumTrackTintColor="#1fb28a"
            maximumTrackTintColor="#d3d3d3"
          />
        </View>

        <Text style={styles.time}>
          {formatTime(position1)} / {formatTime(duration1)}
        </Text>
      </View>

      {/* Audiobook Controls */}
      <View style={styles.trackContainer}>
        <Text style={styles.trackTitle}>Audiobook</Text>
        <Text style={styles.trackName}>{audioPair.audiobook.name}</Text>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Volume: {Math.round(volume2 * 100)}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={volume2}
            onValueChange={handleVolume2Change}
            minimumTrackTintColor="#1fb28a"
            maximumTrackTintColor="#d3d3d3"
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Speed: {rate2.toFixed(2)}x</Text>
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={2.0}
            value={rate2}
            onValueChange={handleRate2Change}
            minimumTrackTintColor="#1fb28a"
            maximumTrackTintColor="#d3d3d3"
          />
        </View>

        <Text style={styles.time}>
          {formatTime(position2)} / {formatTime(duration2)}
        </Text>
      </View>

      {/* Play/Pause Button */}
      <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
        <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  trackContainer: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  trackName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  controlRow: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: '500',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  time: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  playButton: {
    backgroundColor: '#1fb28a',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

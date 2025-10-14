import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import { Track, Playlist, PlayerState, RepeatMode } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { colors } from '../theme/colors';

interface SinglePlayerProps {
  playlist: Playlist | null;
  playerNumber: 1 | 2;
  initialState?: PlayerState;
  onStateChange?: (state: PlayerState) => void;
  onLoadPlaylist: () => void;
}

export const SinglePlayer: React.FC<SinglePlayerProps> = ({
  playlist,
  playerNumber,
  initialState,
  onStateChange,
  onLoadPlaylist,
}) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(initialState?.currentTrackIndex || 0);
  const [position, setPosition] = useState(initialState?.position || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialState?.volume || playerNumber === 1 ? 0.25 : 1);
  const [speed, setSpeed] = useState(initialState?.speed || 1);
  const [repeat, setRepeat] = useState<RepeatMode>(initialState?.repeat || 'off');
  const [shuffle, setShuffle] = useState(initialState?.shuffle || false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>(initialState?.shuffledIndices || []);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const lastPositionUpdate = useRef(0);
  const POSITION_UPDATE_INTERVAL = 500;
  const blobUrl = useRef<string | null>(null);

  const currentTrack = playlist?.tracks[currentTrackIndex];

  // Emit state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        playlistId: playlist?.id,
        currentTrackIndex,
        position,
        volume,
        speed,
        isPlaying,
        shuffle,
        repeat,
        shuffledIndices,
      });
    }
  }, [currentTrackIndex, position, volume, speed, isPlaying, shuffle, repeat, shuffledIndices]);

  // Load track when index changes
  useEffect(() => {
    if (playlist && currentTrack) {
      loadTrack(currentTrack);
    }
    return () => {
      unloadSound();
    };
  }, [currentTrackIndex, playlist]);

  const unloadSound = async () => {
    if (sound) {
      await sound.unloadAsync();
      setSound(null);
    }
    if (Platform.OS === 'web' && blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    }
  };

  const loadTrack = async (track: Track) => {
    try {
      setIsLoading(true);
      await unloadSound();

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      let uri = track.uri;
      if (Platform.OS === 'web' && track.data) {
        blobUrl.current = URL.createObjectURL(track.data);
        uri = blobUrl.current;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        {
          volume,
          rate: speed,
          shouldCorrectPitch: true,
          progressUpdateIntervalMillis: POSITION_UPDATE_INTERVAL,
        },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setPosition(0);
    } catch (error) {
      console.error('Error loading track:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onPlaybackStatusUpdate = useCallback(
    (status: any) => {
      if (status.isLoaded) {
        const now = Date.now();
        if (now - lastPositionUpdate.current > POSITION_UPDATE_INTERVAL) {
          setPosition(status.positionMillis);
          lastPositionUpdate.current = now;
        }

        if (status.durationMillis && status.durationMillis !== duration) {
          setDuration(status.durationMillis);
        }

        if (status.didJustFinish) {
          handleTrackFinish();
        }
      }
    },
    [duration, currentTrackIndex, playlist]
  );

  const handleTrackFinish = () => {
    if (!playlist) return;

    const nextIndex = PlaylistService.getNextTrackIndex(
      currentTrackIndex,
      playlist.tracks.length,
      repeat,
      shuffle,
      shuffledIndices
    );

    if (nextIndex !== null) {
      setCurrentTrackIndex(nextIndex);
      setPosition(0);
    } else {
      setIsPlaying(false);
    }
  };

  const togglePlayPause = async () => {
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  const handleNext = () => {
    if (!playlist) return;

    const nextIndex = PlaylistService.getNextTrackIndex(
      currentTrackIndex,
      playlist.tracks.length,
      repeat,
      shuffle,
      shuffledIndices
    );

    if (nextIndex !== null) {
      setCurrentTrackIndex(nextIndex);
      setPosition(0);
    }
  };

  const handlePrevious = () => {
    if (!playlist) return;

    // If more than 3 seconds played, restart current track
    if (position > 3000) {
      setPosition(0);
      if (sound) {
        sound.setPositionAsync(0);
      }
      return;
    }

    const prevIndex = PlaylistService.getPreviousTrackIndex(
      currentTrackIndex,
      playlist.tracks.length,
      shuffle,
      shuffledIndices
    );

    if (prevIndex !== null) {
      setCurrentTrackIndex(prevIndex);
      setPosition(0);
    }
  };

  const toggleShuffle = () => {
    const newShuffle = !shuffle;
    setShuffle(newShuffle);

    if (newShuffle && playlist) {
      const indices = PlaylistService.createShuffledIndices(
        playlist.tracks.length,
        currentTrackIndex
      );
      setShuffledIndices(indices);
    }
  };

  const cycleRepeat = () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeat);
    setRepeat(modes[(currentIndex + 1) % modes.length]);
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
  };

  const handleVolumeComplete = async (value: number) => {
    if (sound) {
      await sound.setVolumeAsync(value);
    }
  };

  const handleSpeedChange = (value: number) => {
    setSpeed(value);
  };

  const handleSpeedComplete = async (value: number) => {
    if (sound) {
      await sound.setRateAsync(value, true);
    }
  };

  const handlePositionChange = (value: number) => {
    setPosition(value);
  };

  const handlePositionComplete = async (value: number) => {
    if (sound) {
      await sound.setPositionAsync(value);
    }
  };

  const selectTrack = (index: number) => {
    setCurrentTrackIndex(index);
    setPosition(0);
    setShowPlaylist(false);
  };

  const trackInfo = currentTrack
    ? PlaylistService.parseTrackName(currentTrack.name)
    : { title: 'No track' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.playerLabel}>Player {playerNumber}</Text>
        <TouchableOpacity onPress={onLoadPlaylist} style={styles.loadButton}>
          <Text style={styles.loadButtonText}>📁 Load</Text>
        </TouchableOpacity>
      </View>

      {!playlist ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No playlist loaded</Text>
          <Text style={styles.emptySubtext}>Tap Load to select files or folder</Text>
        </View>
      ) : (
        <>
          {/* Track Info */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {trackInfo.title}
            </Text>
            {trackInfo.artist && (
              <Text style={styles.trackArtist} numberOfLines={1}>
                {trackInfo.artist}
              </Text>
            )}
            <Text style={styles.playlistInfo}>
              {currentTrackIndex + 1} / {playlist.tracks.length}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <Text style={styles.timeText}>{PlaylistService.formatTime(position)}</Text>
            <Slider
              style={styles.progressSlider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={position}
              onValueChange={handlePositionChange}
              onSlidingComplete={handlePositionComplete}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <Text style={styles.timeText}>{PlaylistService.formatTime(duration)}</Text>
          </View>

          {/* Playback Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={toggleShuffle} style={styles.controlButton}>
              <Text style={[styles.controlIcon, shuffle && styles.activeControl]}>🔀</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePrevious} style={styles.controlButton}>
              <Text style={styles.controlIcon}>⏮</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlayPause}
              style={[styles.controlButton, styles.playButton]}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleNext} style={styles.controlButton}>
              <Text style={styles.controlIcon}>⏭</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={cycleRepeat} style={styles.controlButton}>
              <Text style={[styles.controlIcon, repeat !== 'off' && styles.activeControl]}>
                {repeat === 'one' ? '🔂' : '🔁'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Volume Control */}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>🔊 Volume</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              onValueChange={handleVolumeChange}
              onSlidingComplete={handleVolumeComplete}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <Text style={styles.sliderValue}>{Math.round(volume * 100)}%</Text>
          </View>

          {/* Speed Control */}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>⚡ Speed</Text>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={2}
              value={speed}
              step={0.1}
              onValueChange={handleSpeedChange}
              onSlidingComplete={handleSpeedComplete}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <Text style={styles.sliderValue}>{speed.toFixed(1)}x</Text>
          </View>

          {/* Playlist Toggle */}
          <TouchableOpacity
            onPress={() => setShowPlaylist(!showPlaylist)}
            style={styles.playlistToggle}
          >
            <Text style={styles.playlistToggleText}>
              {showPlaylist ? '▼' : '▶'} Playlist ({playlist.tracks.length} tracks)
            </Text>
          </TouchableOpacity>

          {/* Playlist */}
          {showPlaylist && (
            <ScrollView style={styles.playlist}>
              {playlist.tracks.map((track, index) => (
                <TouchableOpacity
                  key={track.id}
                  onPress={() => selectTrack(index)}
                  style={[
                    styles.playlistItem,
                    index === currentTrackIndex && styles.activePlaylistItem,
                  ]}
                >
                  <Text style={styles.playlistIndex}>{index + 1}</Text>
                  <Text
                    style={[
                      styles.playlistItemText,
                      index === currentTrackIndex && styles.activePlaylistItemText,
                    ]}
                    numberOfLines={1}
                  >
                    {PlaylistService.parseTrackName(track.name).title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  playerLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  loadButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loadButtonText: {
    color: colors.background,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
  trackInfo: {
    marginBottom: 16,
    alignItems: 'center',
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  playlistInfo: {
    fontSize: 12,
    color: colors.textMuted,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressSlider: {
    flex: 1,
    marginHorizontal: 8,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 45,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 8,
  },
  controlIcon: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  activeControl: {
    color: colors.primary,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: 35,
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 32,
    color: colors.background,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    width: 80,
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
  },
  sliderValue: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 50,
    textAlign: 'right',
  },
  playlistToggle: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  playlistToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playlist: {
    maxHeight: 200,
    marginTop: 8,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activePlaylistItem: {
    backgroundColor: colors.primaryLight,
  },
  playlistIndex: {
    fontSize: 12,
    color: colors.textMuted,
    width: 30,
  },
  playlistItemText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  activePlaylistItemText: {
    color: colors.primary,
    fontWeight: '600',
  },
});

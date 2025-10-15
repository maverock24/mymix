import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import { MediaControl, PlaybackState, Command } from 'expo-media-control';
import { Track, Playlist, PlayerState, RepeatMode } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { colors } from '../theme/colors';

interface SinglePlayerProps {
  playlist: Playlist | null;
  playerNumber: 1 | 2;
  initialState?: PlayerState;
  onStateChange?: (state: PlayerState) => void;
  onLoadPlaylist: () => void;
  isActiveMediaControl?: boolean;
}

export const SinglePlayer: React.FC<SinglePlayerProps> = ({
  playlist,
  playerNumber,
  initialState,
  onStateChange,
  onLoadPlaylist,
  isActiveMediaControl = false,
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
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

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

  // Initialize media controls (only for the active media control player)
  useEffect(() => {
    if (Platform.OS === 'web' || !isActiveMediaControl) return;

    const initializeMediaControls = async () => {
      try {
        await MediaControl.enableMediaControls({
          capabilities: [
            Command.PLAY,
            Command.PAUSE,
            Command.STOP,
            Command.NEXT_TRACK,
            Command.PREVIOUS_TRACK,
          ],
          notification: {
            icon: 'ic_music_note',
            color: '#3ECF8E',
          },
        });

        // Subscribe to media control events
        const removeListener = MediaControl.addListener((event) => {
          switch (event.command) {
            case Command.PLAY:
            case Command.PAUSE:
              togglePlayPause();
              break;
            case Command.STOP:
              if (sound) {
                sound.stopAsync().then(() => setIsPlaying(false));
              }
              break;
            case Command.NEXT_TRACK:
              handleNext();
              break;
            case Command.PREVIOUS_TRACK:
              handlePrevious();
              break;
          }
        });

        // Return cleanup function
        return removeListener;
      } catch (error) {
        console.error('Error initializing media controls:', error);
        return () => {};
      }
    };

    let cleanup: (() => void) | undefined;
    initializeMediaControls().then((fn) => {
      cleanup = fn;
    });

    return () => {
      if (cleanup) {
        cleanup();
      }
      if (Platform.OS !== 'web') {
        MediaControl.removeAllListeners();
      }
    };
  }, [isActiveMediaControl]);

  // Update media control metadata when track changes
  useEffect(() => {
    if (Platform.OS === 'web' || !isActiveMediaControl || !currentTrack) return;

    const updateMediaMetadata = async () => {
      try {
        const trackInfo = PlaylistService.parseTrackName(currentTrack.name);
        await MediaControl.updateMetadata({
          title: trackInfo.title,
          artist: trackInfo.artist || 'Unknown Artist',
          album: `${playlist?.name || 'MyMix'} - Player ${playerNumber}`,
          duration: duration / 1000, // Convert to seconds
        });
      } catch (error) {
        console.error('Error updating media metadata:', error);
      }
    };

    updateMediaMetadata();
  }, [currentTrack, duration, isActiveMediaControl, playlist, playerNumber]);

  // Update playback state when playing status changes
  useEffect(() => {
    if (Platform.OS === 'web' || !isActiveMediaControl) return;

    const updatePlaybackState = async () => {
      try {
        const state = isPlaying ? PlaybackState.PLAYING : PlaybackState.PAUSED;
        await MediaControl.updatePlaybackState(state);
      } catch (error) {
        console.error('Error updating playback state:', error);
      }
    };

    updatePlaybackState();
  }, [isPlaying, isActiveMediaControl]);

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

      // Auto-play if flag is set
      if (shouldAutoPlay) {
        try {
          await newSound.playAsync();
          setIsPlaying(true);
          setShouldAutoPlay(false);
        } catch (error) {
          console.error('Error auto-playing track:', error);
        }
      }
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
      // Auto-play next track since this was triggered by track finishing
      setShouldAutoPlay(true);
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
      // Set flag to auto-play if currently playing
      if (isPlaying) {
        setShouldAutoPlay(true);
      }
      setCurrentTrackIndex(nextIndex);
      setPosition(0);
    }
  };

  const handlePrevious = () => {
    if (!playlist) return;

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
      // Set flag to auto-play if currently playing
      if (isPlaying) {
        setShouldAutoPlay(true);
      }
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
  };

  const trackInfo = currentTrack
    ? PlaylistService.parseTrackName(currentTrack.name)
    : { title: 'No track' };

  const renderPlaylistItem = ({ item, index }: { item: Track; index: number }) => {
    const isActive = index === currentTrackIndex;
    const trackName = PlaylistService.parseTrackName(item.name).title;

    return (
      <TouchableOpacity
        onPress={() => selectTrack(index)}
        style={[styles.playlistItem, isActive && styles.activePlaylistItem]}
      >
        <Text style={styles.playlistIndex}>{index + 1}.</Text>
        <Text
          style={[styles.playlistItemText, isActive && styles.activePlaylistItemText]}
          numberOfLines={1}
        >
          {trackName}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.playerLabel}>Player {playerNumber}</Text>
        <TouchableOpacity onPress={onLoadPlaylist} style={styles.loadButton}>
          <Text style={styles.loadButtonText}>📁</Text>
        </TouchableOpacity>
      </View>

      {/* Playlist - Top Section */}
      {playlist && playlist.tracks.length > 0 && (
        <View style={styles.playlistSection}>
          <TouchableOpacity
            onPress={() => setShowPlaylist(!showPlaylist)}
            style={styles.playlistToggle}
          >
            <Text style={styles.playlistToggleText}>
              {showPlaylist ? '▼' : '▶'} {playlist.tracks.length} tracks
            </Text>
          </TouchableOpacity>

          {showPlaylist && (
            <FlatList
              data={playlist.tracks}
              renderItem={renderPlaylistItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={true}
              style={styles.playlistList}
              contentContainerStyle={styles.playlistContent}
            />
          )}
        </View>
      )}

      {/* Player Controls */}
      <View style={styles.playerArea}>
        {!playlist ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Tap 📁 to select a folder</Text>
            <Text style={styles.emptySubtext}>
              {Platform.OS === 'web'
                ? 'Multiple file selection on web'
                : 'Choose a folder with your audio files'}
            </Text>
          </View>
        ) : (
          <>
            {/* Track Info */}
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={2}>
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
              <TouchableOpacity onPress={toggleShuffle} style={styles.smallButton}>
                <Text style={[styles.smallIcon, shuffle && styles.activeControl]}>🔀</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePrevious} style={styles.controlButton}>
                <Text style={styles.controlIcon}>⏮</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlayPause}
                style={styles.playButton}
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

              <TouchableOpacity onPress={cycleRepeat} style={styles.smallButton}>
                <Text style={[styles.smallIcon, repeat !== 'off' && styles.activeControl]}>
                  {repeat === 'one' ? '🔂' : '🔁'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Volume & Speed */}
            <View style={styles.sliderRow}>
              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>🔊</Text>
                <Slider
                  style={styles.compactSlider}
                  minimumValue={0}
                  maximumValue={1}
                  value={volume}
                  onValueChange={handleVolumeChange}
                  onSlidingComplete={handleVolumeComplete}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
                <Text style={styles.sliderValue}>{Math.round(volume * 100)}</Text>
              </View>

              <View style={styles.sliderGroup}>
                <Text style={styles.sliderLabel}>⚡</Text>
                <Slider
                  style={styles.compactSlider}
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
                <Text style={styles.sliderValue}>{speed.toFixed(1)}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  loadButton: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadButtonText: {
    fontSize: 18,
  },
  playlistSection: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundTertiary,
  },
  playlistToggle: {
    padding: 10,
    paddingHorizontal: 12,
  },
  playlistToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playlistList: {
    maxHeight: 150,
  },
  playlistContent: {
    paddingBottom: 4,
  },
  playlistItem: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  activePlaylistItem: {
    backgroundColor: colors.primary + '20',
  },
  playlistIndex: {
    fontSize: 10,
    color: colors.textMuted,
    width: 24,
  },
  playlistItemText: {
    flex: 1,
    fontSize: 10,
    color: colors.textPrimary,
  },
  activePlaylistItemText: {
    color: colors.primary,
    fontWeight: '600',
  },
  playerArea: {
    padding: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  trackArtist: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  playlistInfo: {
    fontSize: 10,
    color: colors.textMuted,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressSlider: {
    flex: 1,
    marginHorizontal: 8,
    height: 30,
  },
  timeText: {
    fontSize: 10,
    color: colors.textSecondary,
    width: 38,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  smallButton: {
    padding: 8,
  },
  smallIcon: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  controlButton: {
    padding: 8,
    marginHorizontal: 4,
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
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  playIcon: {
    fontSize: 28,
    color: colors.background,
  },
  sliderRow: {
    marginTop: 8,
  },
  sliderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 16,
    width: 24,
  },
  compactSlider: {
    flex: 1,
    marginHorizontal: 8,
    height: 30,
  },
  sliderValue: {
    fontSize: 11,
    color: colors.textSecondary,
    width: 32,
    textAlign: 'right',
  },
});

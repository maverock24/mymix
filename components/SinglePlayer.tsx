import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import { MediaControl, PlaybackState, Command } from '../services/mediaControl';
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

export interface SinglePlayerRef {
  pause: () => Promise<void>;
  play: () => Promise<void>;
}

export const SinglePlayer = forwardRef<SinglePlayerRef, SinglePlayerProps>(({
  playlist,
  playerNumber,
  initialState,
  onStateChange,
  onLoadPlaylist,
  isActiveMediaControl = false,
}, ref) => {
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
  const [showSettings, setShowSettings] = useState(false);
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(initialState?.crossfadeEnabled ?? false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(initialState?.crossfadeDuration ?? 3000);
  const [gaplessEnabled, setGaplessEnabled] = useState(initialState?.gaplessEnabled ?? true);

  const lastPositionUpdate = useRef(0);
  const POSITION_UPDATE_INTERVAL = 500;
  const blobUrl = useRef<string | null>(null);
  const isInitialLoad = useRef(true);
  const nextSound = useRef<Audio.Sound | null>(null);
  const isCrossfading = useRef(false);
  const crossfadeIntervalId = useRef<NodeJS.Timeout | null>(null);

  const currentTrack = playlist?.tracks[currentTrackIndex];

  // Initialize audio mode on mount
  useEffect(() => {
    const initializeAudioMode = async () => {
      if (Platform.OS !== 'web') {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
            interruptionModeAndroid: 2, // INTERRUPTION_MODE_ANDROID_DO_NOT_MIX
            interruptionModeIOS: 2, // INTERRUPTION_MODE_IOS_DO_NOT_MIX
          });
        } catch (error) {
          console.error('Error setting audio mode:', error);
        }
      }
    };

    initializeAudioMode();
  }, []);

  // Expose pause and play methods to parent via ref
  useImperativeHandle(ref, () => ({
    pause: async () => {
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      }
    },
    play: async () => {
      if (sound && !isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
      }
    },
  }), [sound, isPlaying]);

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
        crossfadeEnabled,
        crossfadeDuration,
        gaplessEnabled,
      });
    }
  }, [currentTrackIndex, position, volume, speed, isPlaying, shuffle, repeat, shuffledIndices, crossfadeEnabled, crossfadeDuration, gaplessEnabled]);

  // Load track when index changes
  useEffect(() => {
    if (playlist && currentTrack) {
      loadTrack(currentTrack);
    }
    return () => {
      unloadSound();
    };
  }, [currentTrackIndex, playlist]);

  // Media control event handlers - using refs to avoid stale closures
  const togglePlayPauseRef = useRef(togglePlayPause);
  const handleNextRef = useRef(handleNext);
  const handlePreviousRef = useRef(handlePrevious);
  const soundRef = useRef(sound);

  useEffect(() => {
    togglePlayPauseRef.current = togglePlayPause;
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
    soundRef.current = sound;
  });

  // Initialize media controls (only for the active media control player)
  useEffect(() => {
    if (Platform.OS === 'web' || !isActiveMediaControl) return;

    const initializeMediaControls = async () => {
      try {
        console.log('[MediaControl] Initializing for player', playerNumber);

        await MediaControl.enableMediaControls({
          capabilities: [
            Command.PLAY,
            Command.PAUSE,
            Command.STOP,
            Command.NEXT_TRACK,
            Command.PREVIOUS_TRACK,
          ],
          notification: {
            icon: 'ic_notification',
            color: '#3ECF8E',
          },
        });

        // Subscribe to media control events
        const removeListener = MediaControl.addListener((event) => {
          console.log('[MediaControl] Received command:', event.command);

          switch (event.command) {
            case Command.PLAY:
            case Command.PAUSE:
              togglePlayPauseRef.current();
              break;
            case Command.STOP:
              if (soundRef.current) {
                soundRef.current.stopAsync().then(() => setIsPlaying(false));
              }
              break;
            case Command.NEXT_TRACK:
              handleNextRef.current();
              break;
            case Command.PREVIOUS_TRACK:
              handlePreviousRef.current();
              break;
          }
        });

        console.log('[MediaControl] Listener attached');
        // Return cleanup function
        return removeListener;
      } catch (error) {
        console.error('[MediaControl] Error initializing:', error);
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
  }, [isActiveMediaControl, playerNumber]);

  // Update media control metadata when track changes
  useEffect(() => {
    if (Platform.OS === 'web' || !isActiveMediaControl || !currentTrack) return;

    const updateMediaMetadata = async () => {
      try {
        const trackInfo = PlaylistService.parseTrackName(currentTrack.name);
        const metadata = {
          title: trackInfo.title,
          artist: trackInfo.artist || 'Unknown Artist',
          album: `${playlist?.name || 'MyMix'} - Player ${playerNumber}`,
          duration: duration / 1000, // Convert to seconds
        };

        console.log('[MediaControl] Updating metadata:', metadata);
        await MediaControl.updateMetadata(metadata);
      } catch (error) {
        console.error('[MediaControl] Error updating metadata:', error);
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
        console.log('[MediaControl] Updating playback state:', isPlaying ? 'PLAYING' : 'PAUSED');
        await MediaControl.updatePlaybackState(state);
      } catch (error) {
        console.error('[MediaControl] Error updating playback state:', error);
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
    // Also unload preloaded next sound
    if (nextSound.current) {
      await nextSound.current.unloadAsync();
      nextSound.current = null;
    }
  };

  const preloadNextTrack = async (track: Track) => {
    if (nextSound.current) return; // Already preloaded

    try {
      let uri = track.uri;
      if (Platform.OS === 'web' && track.data) {
        uri = URL.createObjectURL(track.data);
      }

      const { sound: preloadedSound } = await Audio.Sound.createAsync(
        { uri },
        {
          volume,
          rate: speed,
          shouldCorrectPitch: true,
        }
      );

      nextSound.current = preloadedSound;
    } catch (error) {
      console.error('Error preloading next track:', error);
    }
  };

  const loadTrack = async (track: Track) => {
    try {
      setIsLoading(true);

      // Set audio mode first, even for preloaded tracks
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 2, // INTERRUPTION_MODE_ANDROID_DO_NOT_MIX
        interruptionModeIOS: 2, // INTERRUPTION_MODE_IOS_DO_NOT_MIX
      });

      let newSound: Audio.Sound;

      // Use preloaded sound for gapless playback if available
      if (gaplessEnabled && nextSound.current) {
        newSound = nextSound.current;
        nextSound.current = null; // Clear the ref

        // Set up status callback for the preloaded sound
        newSound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);

        // Update to current sound before unloading old one
        const oldSound = sound;
        setSound(newSound);

        // Unload old sound
        if (oldSound) {
          await oldSound.unloadAsync();
        }
      } else {
        // Standard loading
        await unloadSound();

        let uri = track.uri;
        if (Platform.OS === 'web' && track.data) {
          blobUrl.current = URL.createObjectURL(track.data);
          uri = blobUrl.current;
        }

        const soundObject = await Audio.Sound.createAsync(
          { uri },
          {
            volume,
            rate: speed,
            shouldCorrectPitch: true,
            progressUpdateIntervalMillis: POSITION_UPDATE_INTERVAL,
          },
          onPlaybackStatusUpdate
        );

        newSound = soundObject.sound;
        setSound(newSound);
      }

      // On initial load, restore saved position; otherwise reset to 0
      if (isInitialLoad.current && initialState?.position) {
        try {
          await newSound.setPositionAsync(initialState.position);
          setPosition(initialState.position);
          isInitialLoad.current = false;

          // If was playing before, resume playback
          if (initialState.isPlaying) {
            await newSound.playAsync();
            setIsPlaying(true);
          }
        } catch (error) {
          console.error('Error restoring position:', error);
          setPosition(0);
        }
      } else {
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

        // Preload next track for gapless playback (when within last 5 seconds)
        if (gaplessEnabled && playlist && status.durationMillis && !nextSound.current) {
          const timeRemaining = status.durationMillis - status.positionMillis;
          if (timeRemaining <= 5000 && timeRemaining > 0) {
            const nextIndex = PlaylistService.getNextTrackIndex(
              currentTrackIndex,
              playlist.tracks.length,
              repeat,
              shuffle,
              shuffledIndices
            );
            if (nextIndex !== null) {
              preloadNextTrack(playlist.tracks[nextIndex]);
            }
          }
        }

        if (status.didJustFinish) {
          handleTrackFinish();
        }
      }
    },
    [duration, currentTrackIndex, playlist, gaplessEnabled, repeat, shuffle, shuffledIndices]
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
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
            <Text style={styles.settingsButtonText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLoadPlaylist} style={styles.loadButton}>
            <Text style={styles.loadButtonText}>📁</Text>
          </TouchableOpacity>
        </View>
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
            <View
              style={styles.playlistListContainer}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <FlatList
                data={playlist.tracks}
                renderItem={renderPlaylistItem}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={true}
                style={styles.playlistList}
                contentContainerStyle={styles.playlistContent}
                nestedScrollEnabled={true}
                scrollEnabled={true}
              />
            </View>
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
              <TouchableOpacity
                onPress={toggleShuffle}
                style={[styles.modeButton, shuffle && styles.modeButtonActive]}
              >
                <Text style={styles.modeIcon}>🔀</Text>
                <Text style={[styles.modeLabel, !shuffle && styles.modeLabelInactive]}>
                  {shuffle ? 'ON' : 'OFF'}
                </Text>
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

              <TouchableOpacity
                onPress={cycleRepeat}
                style={[styles.modeButton, repeat !== 'off' && styles.modeButtonActive]}
              >
                <Text style={styles.modeIcon}>
                  {repeat === 'one' ? '🔂' : '🔁'}
                </Text>
                <Text style={[styles.modeLabel, repeat === 'off' && styles.modeLabelInactive]}>
                  {repeat === 'one' ? '1' : repeat === 'all' ? 'ALL' : 'OFF'}
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

            {/* Playback Options */}
            <View style={styles.playbackOptions}>
              <TouchableOpacity
                onPress={() => setGaplessEnabled(!gaplessEnabled)}
                style={[styles.optionButton, gaplessEnabled && styles.optionButtonActive]}
              >
                <Text style={styles.optionIcon}>⚡</Text>
                <Text style={[styles.optionText, !gaplessEnabled && styles.optionTextInactive]}>
                  Gapless
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCrossfadeEnabled(!crossfadeEnabled)}
                style={[styles.optionButton, crossfadeEnabled && styles.optionButtonActive]}
              >
                <Text style={styles.optionIcon}>🎚️</Text>
                <Text style={[styles.optionText, !crossfadeEnabled && styles.optionTextInactive]}>
                  Crossfade
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View style={styles.settingsModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.settingsTitle}>Playback Settings</Text>
            <Text style={styles.settingsSubtitle}>Player {playerNumber}</Text>

            {/* Gapless Playback Setting */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>⚡ Gapless Playback</Text>
                <Text style={styles.settingDescription}>
                  Seamless transitions between tracks with no silence
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, gaplessEnabled && styles.toggleActive]}
                onPress={() => setGaplessEnabled(!gaplessEnabled)}
              >
                <View style={[styles.toggleThumb, gaplessEnabled && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Crossfade Setting */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>🎚️ Crossfade</Text>
                <Text style={styles.settingDescription}>
                  Smooth audio transitions between tracks
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, crossfadeEnabled && styles.toggleActive]}
                onPress={() => setCrossfadeEnabled(!crossfadeEnabled)}
              >
                <View style={[styles.toggleThumb, crossfadeEnabled && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Crossfade Duration Slider */}
            {crossfadeEnabled && (
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Crossfade Duration</Text>
                  <Text style={styles.settingDescription}>
                    {(crossfadeDuration / 1000).toFixed(1)}s fade between tracks
                  </Text>
                </View>
                <Slider
                  style={styles.durationSlider}
                  minimumValue={1000}
                  maximumValue={10000}
                  step={500}
                  value={crossfadeDuration}
                  onValueChange={setCrossfadeDuration}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </View>
            )}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeSettingsButton}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeSettingsButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  settingsButton: {
    backgroundColor: colors.backgroundSecondary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsButtonText: {
    fontSize: 16,
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
  playlistListContainer: {
    maxHeight: 200,
  },
  playlistList: {
    flex: 1,
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
    gap: 8,
  },
  modeButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: 50,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary + '25',
    borderColor: colors.primary,
  },
  modeIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  modeLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 2,
  },
  modeLabelInactive: {
    color: colors.textMuted,
    opacity: 0.6,
  },
  controlButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  controlIcon: {
    fontSize: 24,
    color: colors.textPrimary,
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
  playbackOptions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  optionButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  optionIcon: {
    fontSize: 14,
  },
  optionText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  optionTextInactive: {
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  settingsModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  settingsSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  settingRow: {
    marginBottom: 20,
  },
  settingInfo: {
    marginBottom: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary + '40',
    borderColor: colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  toggleThumbActive: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  durationSlider: {
    width: '100%',
    height: 40,
  },
  closeSettingsButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  closeSettingsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});

SinglePlayer.displayName = 'SinglePlayer';

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
import { Audio } from 'expo-audio';
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
  isLoadingPlaylist?: boolean;
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
  isLoadingPlaylist = false,
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

  const lastPositionUpdate = useRef(0);
  const POSITION_UPDATE_INTERVAL = 500;
  const blobUrl = useRef<string | null>(null);
  const isInitialLoad = useRef(true);


  const currentTrack = playlist?.tracks[currentTrackIndex];

  // Sync currentTrackIndex when playlist changes or initialState updates
  useEffect(() => {
    if (playlist && initialState) {
      if (initialState.playlistId === playlist.id) {
        console.log(`[Player ${playerNumber}] Syncing track index from initialState:`, initialState.currentTrackIndex);
        setCurrentTrackIndex(initialState.currentTrackIndex);
      } else {
        // New playlist loaded, reset to beginning
        console.log(`[Player ${playerNumber}] New playlist loaded, resetting to track 0`);
        setCurrentTrackIndex(0);
      }
    } else if (playlist && !initialState) {
      // New playlist, no initial state
      console.log(`[Player ${playerNumber}] Playlist loaded without initialState, starting at track 0`);
      setCurrentTrackIndex(0);
    }
  }, [playlist, initialState, playerNumber]);

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
      });
    }
  }, [currentTrackIndex, position, volume, speed, isPlaying, shuffle, repeat, shuffledIndices]);

  // Load track when index changes
  useEffect(() => {
    console.log(`[Player ${playerNumber}] Track loading useEffect triggered:`, {
      hasPlaylist: !!playlist,
      currentTrackIndex,
      hasCurrentTrack: !!currentTrack,
      trackTitle: currentTrack?.title
    });

    if (playlist && currentTrack) {
      console.log(`[Player ${playerNumber}] Loading track at index ${currentTrackIndex}:`, currentTrack.title);
      loadTrack(currentTrack);
    } else {
      console.log(`[Player ${playerNumber}] Cannot load track - missing playlist or track`);
    }

    return () => {
      unloadSound();
    };
  }, [currentTrackIndex, playlist, currentTrack, playerNumber]);

  // Media control event handlers - using refs to avoid stale closures
  const togglePlayPauseRef = useRef<(() => Promise<void>) | null>(null);
  const handleNextRef = useRef<(() => void) | null>(null);
  const handlePreviousRef = useRef<(() => void) | null>(null);
  const soundRef = useRef(sound);

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
        const removeListener = MediaControl.addListener((event: any) => {
          console.log('[MediaControl] Received command:', event.command);

          switch (event.command) {
            case Command.PLAY:
            case Command.PAUSE:
              if (togglePlayPauseRef.current) {
                togglePlayPauseRef.current();
              }
              break;
            case Command.STOP:
              if (soundRef.current) {
                soundRef.current.stopAsync().then(() => setIsPlaying(false));
              }
              break;
            case Command.NEXT_TRACK:
              if (handleNextRef.current) {
                handleNextRef.current();
              }
              break;
            case Command.PREVIOUS_TRACK:
              if (handlePreviousRef.current) {
                handlePreviousRef.current();
              }
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
  };

  const loadTrack = async (track: Track) => {
    try {
      console.log(`[Player ${playerNumber}] Loading track:`, track.title);
      setIsLoading(true);

      // Set audio mode first
      console.log(`[Player ${playerNumber}] Setting audio mode...`);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 2, // INTERRUPTION_MODE_ANDROID_DO_NOT_MIX
        interruptionModeIOS: 2, // INTERRUPTION_MODE_IOS_DO_NOT_MIX
      });

      // Standard loading
      console.log(`[Player ${playerNumber}] Unloading previous sound...`);
      await unloadSound();

      let uri = track.uri;
      if (Platform.OS === 'web' && track.data) {
        blobUrl.current = URL.createObjectURL(track.data);
        uri = blobUrl.current;
      }

      console.log(`[Player ${playerNumber}] Creating sound from URI:`, uri);
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

      const newSound = soundObject.sound;
      console.log(`[Player ${playerNumber}] Sound created successfully`);
      setSound(newSound);

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
      console.error(`[Player ${playerNumber}] Error loading track:`, error);
      Alert.alert('Loading Error', `Failed to load track: ${error.message || error}`);
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
    [duration]
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
    console.log(`[Player ${playerNumber}] togglePlayPause called. sound:`, !!sound, 'isPlaying:', isPlaying);

    if (!sound) {
      console.warn(`[Player ${playerNumber}] Cannot play - no sound loaded`);
      return;
    }

    try {
      if (isPlaying) {
        console.log(`[Player ${playerNumber}] Pausing...`);
        await sound.pauseAsync();
        setIsPlaying(false);
        console.log(`[Player ${playerNumber}] Paused successfully`);
      } else {
        console.log(`[Player ${playerNumber}] Playing...`);
        await sound.playAsync();
        setIsPlaying(true);
        console.log(`[Player ${playerNumber}] Playing successfully`);
      }
    } catch (error) {
      console.error(`[Player ${playerNumber}] Error toggling play/pause:`, error);
      Alert.alert('Playback Error', `Failed to ${isPlaying ? 'pause' : 'play'}: ${error.message || error}`);
    }
  };

  // Update refs when functions change
  useEffect(() => {
    togglePlayPauseRef.current = togglePlayPause;
    soundRef.current = sound;
  });

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

  // Update handleNext and handlePrevious refs
  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
  });

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

  const handleVolumeChange = async (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVolume);
    if (sound) {
      await sound.setVolumeAsync(newVolume);
    }
  };

  const handleSpeedChange = async (delta: number) => {
    const newSpeed = Math.max(0.5, Math.min(2, speed + delta));
    setSpeed(newSpeed);
    if (sound) {
      await sound.setRateAsync(newSpeed, true);
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
    setShowPlaylist(false); // Close playlist modal after selection
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
        <Text style={styles.playerLabel}>{playerNumber === 1 ? 'Main' : 'Background'}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={onLoadPlaylist} style={styles.loadButton}>
            <Text style={styles.loadButtonText}>📁</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Playlist - Track Count Button */}
      {playlist && playlist.tracks.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowPlaylist(true)}
          style={styles.playlistToggle}
        >
          <Text style={styles.playlistToggleText}>
            📋 {playlist.tracks.length} tracks
          </Text>
        </TouchableOpacity>
      )}

      {/* Player Controls */}
      <View style={styles.playerArea}>
        {!playlist ? (
          <View style={styles.emptyState}>
            {isLoadingPlaylist ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
                <Text style={styles.loadingText}>Loading files...</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>Tap 📁 to select a folder</Text>
                <Text style={styles.emptySubtext}>
                  {Platform.OS === 'web'
                    ? 'Multiple file selection on web'
                    : 'Choose a folder with your audio files'}
                </Text>
              </>
            )}
          </View>
        ) : (
          <>
            {/* Main Content - Vertical Layout */}
            <View style={styles.mainContentContainer}>
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
              <View style={styles.controlsSection}>
                {/* Mode Buttons and Playback Controls */}
                <View style={styles.controls}>
                  <TouchableOpacity
                    onPress={toggleShuffle}
                    style={[styles.modeButton, shuffle && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeLabelSmall, !shuffle && styles.modeLabelInactive]}>
                      SHUFFLE
                    </Text>
                    <Text style={[styles.modeLabelSmall, !shuffle && styles.modeLabelInactive]}>
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
                    <Text style={[styles.modeLabelSmall, repeat === 'off' && styles.modeLabelInactive]}>
                      REPEAT
                    </Text>
                    <Text style={[styles.modeLabelSmall, repeat === 'off' && styles.modeLabelInactive]}>
                      {repeat === 'one' ? '1' : repeat === 'all' ? 'ALL' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Volume and Speed Controls - New Row Layout */}
              <View style={styles.secondaryControls}>
                {/* Volume Control */}
                <View style={styles.controlGroupHorizontal}>
                  <TouchableOpacity
                    style={styles.adjustButtonSmall}
                    onPress={() => handleVolumeChange(-0.1)}
                    disabled={volume <= 0}
                  >
                    <Text style={styles.adjustButtonText}>−</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.valueDisplayCompact}>
                    <Text style={styles.valueLabel}>VOL</Text>
                    <Text style={styles.valueTextCompact}>{Math.round(volume * 100)}%</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.adjustButtonSmall}
                    onPress={() => handleVolumeChange(0.1)}
                    disabled={volume >= 1}
                  >
                    <Text style={styles.adjustButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* Speed Control */}
                <View style={styles.controlGroupHorizontal}>
                  <TouchableOpacity
                    style={styles.adjustButtonSmall}
                    onPress={() => handleSpeedChange(-0.1)}
                    disabled={speed <= 0.5}
                  >
                    <Text style={styles.adjustButtonText}>−</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.valueDisplayCompact}>
                    <Text style={styles.valueLabel}>SPEED</Text>
                    <Text style={styles.valueTextCompact}>{speed.toFixed(1)}×</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.adjustButtonSmall}
                    onPress={() => handleSpeedChange(0.1)}
                    disabled={speed >= 2}
                  >
                    <Text style={styles.adjustButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Playlist Modal */}
      <Modal
        visible={showPlaylist}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPlaylist(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPlaylist(false)}
        >
          <View style={styles.playlistModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.playlistModalTitle}>
              {playerNumber === 1 ? 'Main' : 'Background'} Playlist
            </Text>
            <Text style={styles.playlistModalSubtitle}>
              {playlist?.tracks.length} tracks
            </Text>

            <FlatList
              data={playlist?.tracks || []}
              renderItem={renderPlaylistItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={true}
              style={styles.playlistModalList}
            />

            <TouchableOpacity
              style={styles.closePlaylistButton}
              onPress={() => setShowPlaylist(false)}
            >
              <Text style={styles.closePlaylistButtonText}>Close</Text>
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
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
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
    padding: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  playlistToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playlistList: {
    maxHeight: 180,
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
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingIndicator: {
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  trackArtist: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  playlistInfo: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressSlider: {
    flex: 1,
    marginHorizontal: 8,
    height: 32,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 40,
  },
  mainContentContainer: {
    flexDirection: 'column',
    width: '100%',
  },
  controlsSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border + '40',
  },
  controlGroupHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjustButtonSmall: {
    width: 32,
    height: 32,
    backgroundColor: colors.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.background,
    lineHeight: 18,
  },
  valueDisplayCompact: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  valueTextCompact: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  valueLabel: {
    fontSize: 8,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    width: '100%',
  },
  modeButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
    borderWidth: 2,
  },
  modeLabelSmall: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
  },
  modeLabelInactive: {
    color: colors.textMuted,
  },
  controlButton: {
    padding: 4,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controlIcon: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: 32,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  playIcon: {
    fontSize: 32,
    color: colors.background,
  },
  playbackOptions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  optionButtonCompact: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 3,
  },
  optionIconSmall: {
    fontSize: 20,
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
  playlistModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    alignSelf: 'center',
  },
  playlistModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  playlistModalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  playlistModalList: {
    flexGrow: 0,
  },
  closePlaylistButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  closePlaylistButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});

SinglePlayer.displayName = 'SinglePlayer';

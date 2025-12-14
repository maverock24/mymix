import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Modal,
  TextInput,
  Alert,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import { PlaybackState, Command, MediaControl } from '../services/mediaControl';
import { Track, Playlist, PlayerState, RepeatMode } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { useTheme } from '../theme/ThemeProvider';
import { colors } from '../theme/colors';
import { AnimatedButton, PlayButton, ControlButton } from './AnimatedButton';
import { playbackCoordinator } from '../services/playbackCoordinator';

type SortOption = 'default' | 'title' | 'artist' | 'duration';

const ScrollingText = ({ text, isPlaying, style }: { text: string, isPlaying: boolean, style: any }) => {
  const [textWidth, setTextWidth] = useState(0);
  const containerWidth = useRef(Dimensions.get('window').width - 100).current; // Approximate container width
  const animatedValue = useRef(new Animated.Value(0)).current;
  const scrollAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!isPlaying || textWidth <= containerWidth) {
      animatedValue.setValue(0);
      scrollAnimation.current?.stop();
      return;
    }

    const duration = textWidth * 30; // Adjust speed here

    const startAnimation = () => {
      animatedValue.setValue(0);
      scrollAnimation.current = Animated.loop(
        Animated.timing(animatedValue, {
          toValue: -textWidth - 50, // Scroll past width + padding
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      scrollAnimation.current.start();
    };

    startAnimation();

    return () => {
      scrollAnimation.current?.stop();
    };
  }, [text, textWidth, isPlaying, containerWidth]);

  return (
    <View style={{ overflow: 'hidden', flex: 1, flexDirection: 'row' }}>
      <Animated.Text
        style={[
          style,
          {
            transform: [{ translateX: animatedValue }],
            width: textWidth > containerWidth ? undefined : '100%',
             paddingRight: 50, // Gap between looping text
          },
        ]}
        onLayout={(e) => {
             if (textWidth === 0) {
                // Only measure once or if text changes (key should handle that)
             }
        }}
      >
        {text}
      </Animated.Text>
      {/* Duplicate text for looping effect if needed */}
      {textWidth > containerWidth && (
          <Animated.Text
            style={[
              style,
              {
                  transform: [{ translateX: animatedValue }],
                  paddingRight: 50,
                  position: 'absolute',
                  left: textWidth + 50, // Start after first text + padding
                  width: 1000
              },
            ]}
          >
            {text}
          </Animated.Text>
      )}

      {/* Hidden text to measure actual width */}
       <Text 
        style={[style, { position: 'absolute', opacity: 0, width: undefined }]}
        onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
      >
        {text}
      </Text>
    </View>
  );
};

interface SinglePlayerProps {
  playlist: Playlist | null;
  playerNumber: 1 | 2;
  initialState?: PlayerState;
  onStateChange?: (state: PlayerState) => void;
  onLoadPlaylist: () => void;
  isActiveMediaControl?: boolean;
  isLoadingPlaylist?: boolean;
  playbackGroupId?: string;
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
  playbackGroupId = 'default',
}, ref) => {
  const { theme } = useTheme();
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
  const shouldAutoPlayRef = useRef(false);
  const [permissionMissing, setPermissionMissing] = useState(false);

  // AB Repeat state
  const [abRepeatActive, setAbRepeatActive] = useState(false);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);

  // Search and Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [showSearchSort, setShowSearchSort] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const lastPositionUpdate = useRef(0);
  const POSITION_UPDATE_INTERVAL = 500;
  const blobUrl = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  const currentTrack = playlist?.tracks[currentTrackIndex];

  // Get filtered and sorted tracks
  const getFilteredSortedTracks = useCallback(() => {
    if (!playlist) return [];

    let tracks = [...playlist.tracks].map((track, index) => ({ ...track, originalIndex: index }));

    // Apply favorites filter
    if (showFavoritesOnly) {
      tracks = tracks.filter(track => favorites.has(track.id));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tracks = tracks.filter(track => {
        const info = PlaylistService.parseTrackName(track.name);
        return (
          info.title.toLowerCase().includes(query) ||
          (info.artist && info.artist.toLowerCase().includes(query)) ||
          track.name.toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    switch (sortOption) {
      case 'title':
        tracks.sort((a, b) => {
          const titleA = PlaylistService.parseTrackName(a.name).title.toLowerCase();
          const titleB = PlaylistService.parseTrackName(b.name).title.toLowerCase();
          return titleA.localeCompare(titleB);
        });
        break;
      case 'artist':
        tracks.sort((a, b) => {
          const artistA = (PlaylistService.parseTrackName(a.name).artist || '').toLowerCase();
          const artistB = (PlaylistService.parseTrackName(b.name).artist || '').toLowerCase();
          return artistA.localeCompare(artistB);
        });
        break;
      case 'duration':
        // Duration sort would require duration metadata, skip for now
        break;
      default:
        // Keep original order
        break;
    }

    return tracks;
  }, [playlist, searchQuery, sortOption, showFavoritesOnly, favorites]);

  // Sync currentTrackIndex when playlist changes or initialState updates
  useEffect(() => {
    if (playlist && initialState) {
      if (initialState.playlistId === playlist.id) {
        console.log(`[Player ${playerNumber}] Syncing track index from initialState:`, initialState.currentTrackIndex);
        setCurrentTrackIndex(initialState.currentTrackIndex);
      } else {
        console.log(`[Player ${playerNumber}] New playlist loaded, resetting to track 0`);
        setCurrentTrackIndex(0);
      }
    } else if (playlist && !initialState) {
      console.log(`[Player ${playerNumber}] Playlist loaded without initialState, starting at track 0`);
      setCurrentTrackIndex(0);
    }
  }, [playlist, initialState, playerNumber]);

  // Initialize audio mode on mount
  useEffect(() => {
    const initializeAudioMode = async () => {
      if ((Platform.OS as string) !== 'web') {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
            interruptionModeAndroid: 2,
            interruptionModeIOS: 2,
          });
        } catch (error) {
          console.error('Error setting audio mode:', error);
        }
      }
    };

    initializeAudioMode();
  }, []);

  // Load favorites from storage
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const { StorageService } = await import('../services/storage');
        const savedFavorites = await StorageService.getFavorites();
        setFavorites(new Set(savedFavorites));
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    };
    loadFavorites();
  }, []);

  // Register with PlaybackCoordinator
  useEffect(() => {
    const id = `single-player-${playerNumber}`;
    return playbackCoordinator.register(id, playbackGroupId, async () => {
      if (soundRef.current) { // Use ref to access latest sound instance
        console.log(`[Player ${playerNumber}] Pausing due to coordinator request`);
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    });
  }, [playerNumber, playbackGroupId]);

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
        playbackCoordinator.notifyPlay(playbackGroupId);
        await sound.playAsync();
        setIsPlaying(true);
      }
    },
  }), [sound, isPlaying, playbackGroupId]);

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
      trackTitle: currentTrack?.name
    });

    if (playlist && currentTrack) {
      console.log(`[Player ${playerNumber}] Loading track at index ${currentTrackIndex}:`, currentTrack.name);
      loadTrack(currentTrack);
    } else {
      console.log(`[Player ${playerNumber}] Cannot load track - missing playlist or track`);
    }

    return () => {
      unloadSound();
    };
  }, [currentTrackIndex, playlist, currentTrack, playerNumber]);

  // AB Repeat loop check
  useEffect(() => {
    if (abRepeatActive && pointA !== null && pointB !== null && position >= pointB) {
      if (sound) {
        sound.setPositionAsync(pointA);
      }
    }
  }, [position, abRepeatActive, pointA, pointB, sound]);



  // Media control event handlers - using refs to avoid stale closures
  const togglePlayPauseRef = useRef<(() => Promise<void>) | null>(null);
  const handleNextRef = useRef<(() => void) | null>(null);
  const handlePreviousRef = useRef<(() => void) | null>(null);
  const soundRef = useRef(sound);
  
  // Refs to avoid stale closures in onPlaybackStatusUpdate
  const handleTrackFinishRef = useRef<(() => void) | null>(null);




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
      if ((Platform.OS as string) !== 'web') {
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
          duration: duration / 1000,
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
      setPermissionMissing(false);
      console.log(`[Player ${playerNumber}] Loading track:`, track.name);
      setIsLoading(true);

      console.log(`[Player ${playerNumber}] Unloading previous sound...`);
      await unloadSound();

      let uri = track.uri;
      if (Platform.OS === 'web') {
        if (track.data) {
          blobUrl.current = URL.createObjectURL(track.data);
          uri = blobUrl.current;
        } else if (track.fileHandle) {
          console.log(`[Player ${playerNumber}] Lazy loading content from file handle...`);
          try {
            const file = await track.fileHandle.getFile();
            blobUrl.current = URL.createObjectURL(file);
            uri = blobUrl.current;
            console.log(`[Player ${playerNumber}] File loaded, blob size:`, file.size);
          } catch (err) {
            console.error(`[Player ${playerNumber}] Error loading file from handle:`, err);
            setPermissionMissing(true);
            throw new Error('Permission required to access file. Tap Play to grant.');
          }
        }
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

      // Reset AB Repeat when loading new track
      setAbRepeatActive(false);
      setPointA(null);
      setPointB(null);


      if (isInitialLoad.current && initialState?.position) {
        try {
          await newSound.setPositionAsync(initialState.position);
          setPosition(initialState.position);
          isInitialLoad.current = false;

          if (initialState.isPlaying) {
            playbackCoordinator.notifyPlay(playbackGroupId);
            await newSound.playAsync();
            setIsPlaying(true);
          }
        } catch (error) {
          console.error('Error restoring position:', error);
          setPosition(0);
        }
      } else {
        setPosition(0);

        if (shouldAutoPlayRef.current) {
          shouldAutoPlayRef.current = false; // Reset immediately to prevent loops
          try {
            playbackCoordinator.notifyPlay(playbackGroupId);
            await newSound.playAsync();
            setIsPlaying(true);
          } catch (error) {
            console.error('Error auto-playing track:', error);
            setIsPlaying(false); // Ensure state is sync
          }
        }
      }
    } catch (error: any) {
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

        if (status.durationMillis) {
          setDuration(status.durationMillis);
        }

        if (status.didJustFinish) {
          if (handleTrackFinishRef.current) {
             handleTrackFinishRef.current();
          }
        }
        
        // Sync isPlaying state if it changes externally (e.g. interruption)
        setIsPlaying(status.isPlaying);
      }
    },
    []
  );



  const handleTrackFinish = () => {
    console.log(`[Player ${playerNumber}] Track finished. Logic starting...`);
    const visibleTracks = getFilteredSortedTracks();
    if (visibleTracks.length === 0) {
        console.log(`[Player ${playerNumber}] No visible tracks to play next.`);
        setIsPlaying(false);
        return;
    }

    const currentVisibleIndex = visibleTracks.findIndex(t => t.originalIndex === currentTrackIndex);
    
    let nextVisibleIndex = -1;

    if (shuffle) {
        nextVisibleIndex = Math.floor(Math.random() * visibleTracks.length);
        if (visibleTracks.length > 1 && nextVisibleIndex === currentVisibleIndex) {
            nextVisibleIndex = (nextVisibleIndex + 1) % visibleTracks.length;
        }
    } else {
        if (repeat === 'one') {
            // If current track is hidden but repeat is one, we should probably repeat it?
            // But we can't find it in visibleTracks to get the object.
            // We can just keep currentTrackIndex!
            // But we need to reload it to replay it (since position is at end).
            if (currentVisibleIndex === -1) {
                 // Track hidden, but repeat one. Just replay current.
                 shouldAutoPlayRef.current = true;
                 setCurrentTrackIndex(currentTrackIndex); // Trigger reload
                 setPosition(0);
                 return;
            }
            nextVisibleIndex = currentVisibleIndex;
        } else if (currentVisibleIndex < visibleTracks.length - 1) {
            nextVisibleIndex = currentVisibleIndex + 1;
        } else if (repeat === 'all') {
            nextVisibleIndex = 0;
        }
    }

    if (nextVisibleIndex !== -1) {
      const nextTrack = visibleTracks[nextVisibleIndex];
      shouldAutoPlayRef.current = true;
      setCurrentTrackIndex(nextTrack.originalIndex!);
      setPosition(0);
    } else {
      setIsPlaying(false);
    }
  };

  const requestPermissionAndPlay = async () => {
    if (!currentTrack || !currentTrack.fileHandle) return;
    try {
      // @ts-ignore - Web only API
      const permission = await currentTrack.fileHandle.requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        setPermissionMissing(false);
        loadTrack(currentTrack);
        // We might need to set shouldAutoPlayRef to true here, but loadTrack will handle it if called directly? 
        // No, loadTrack resets it. We should set it to true.
        shouldAutoPlayRef.current = true;
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  };

  const togglePlayPause = async () => {
    console.log(`[Player ${playerNumber}] togglePlayPause called. sound:`, !!sound, 'isPlaying:', isPlaying);

    if (permissionMissing) {
      await requestPermissionAndPlay();
      return;
    }

    if (!sound) {
      // If no sound but we have a playlist, try to load the first track
      const visibleTracks = getFilteredSortedTracks();
      if (visibleTracks.length > 0) {
          shouldAutoPlayRef.current = true;
          setCurrentTrackIndex(visibleTracks[0].originalIndex!);
          return;
      }
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
        playbackCoordinator.notifyPlay(playbackGroupId);
        await sound.playAsync();
        setIsPlaying(true);
        console.log(`[Player ${playerNumber}] Playing successfully`);
      }
    } catch (error: any) {
      console.error(`[Player ${playerNumber}] Error toggling play/pause:`, error);
      Alert.alert('Playback Error', `Failed to ${isPlaying ? 'pause' : 'play'}: ${error.message || error}`);
    }
  };

  useEffect(() => {
    togglePlayPauseRef.current = togglePlayPause;
    soundRef.current = sound;
    handleTrackFinishRef.current = handleTrackFinish;
  });

  const handleNext = () => {
    const visibleTracks = getFilteredSortedTracks();
    if (visibleTracks.length === 0) return;

    const currentVisibleIndex = visibleTracks.findIndex(t => t.originalIndex === currentTrackIndex);
    
    let nextVisibleIndex = -1;

    if (shuffle) {
        nextVisibleIndex = Math.floor(Math.random() * visibleTracks.length);
    } else {
        // For manual next, we wrap around even if repeat is off, usually
        // But strictly:
        if (currentVisibleIndex < visibleTracks.length - 1) {
            nextVisibleIndex = currentVisibleIndex + 1;
        } else {
            nextVisibleIndex = 0; // Wrap to start
        }
    }

    if (nextVisibleIndex !== -1) {
      const nextTrack = visibleTracks[nextVisibleIndex];
      if (isPlaying) {
        shouldAutoPlayRef.current = true;
      }
      setCurrentTrackIndex(nextTrack.originalIndex!);
      setPosition(0);
    }
  };

  const handlePrevious = () => {
    if (position > 3000) {
      setPosition(0);
      if (sound) {
        sound.setPositionAsync(0);
      }
      return;
    }

    const visibleTracks = getFilteredSortedTracks();
    if (visibleTracks.length === 0) return;

    const currentVisibleIndex = visibleTracks.findIndex(t => t.originalIndex === currentTrackIndex);
    
    let prevVisibleIndex = -1;

    if (shuffle) {
         prevVisibleIndex = Math.floor(Math.random() * visibleTracks.length);
    } else {
        if (currentVisibleIndex > 0) {
            prevVisibleIndex = currentVisibleIndex - 1;
        } else {
            prevVisibleIndex = visibleTracks.length - 1; // Wrap to end
        }
    }

    if (prevVisibleIndex !== -1) {
      const prevTrack = visibleTracks[prevVisibleIndex];
      if (isPlaying) {
        shouldAutoPlayRef.current = true;
      }
      setCurrentTrackIndex(prevTrack.originalIndex!);
      setPosition(0);
    }
  };

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
    shouldAutoPlayRef.current = true;
    setCurrentTrackIndex(index);
    setPosition(0);
    setShowPlaylist(false);
  };

  // AB Repeat functions
  const setPointAB = () => {
    if (pointA === null) {
      setPointA(position);
    } else if (pointB === null) {
      if (position > pointA) {
        setPointB(position);
        setAbRepeatActive(true);
      } else {
        // Reset if B is before A
        setPointA(position);
        setPointB(null);
      }
    } else {
      // Clear AB repeat
      setPointA(null);
      setPointB(null);
      setAbRepeatActive(false);
    }
  };

  // Toggle favorite
  const toggleFavorite = async (trackId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(trackId)) {
      newFavorites.delete(trackId);
    } else {
      newFavorites.add(trackId);
    }
    setFavorites(newFavorites);

    try {
      const { StorageService } = await import('../services/storage');
      await StorageService.saveFavorites(Array.from(newFavorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const trackInfo = currentTrack
    ? PlaylistService.parseTrackName(currentTrack.name)
    : { title: 'No track' };

  const renderPlaylistItem = ({ item, index }: { item: Track & { originalIndex?: number }; index: number }) => {
    const actualIndex = item.originalIndex !== undefined ? item.originalIndex : index;
    const isActive = actualIndex === currentTrackIndex;
    const trackName = PlaylistService.parseTrackName(item.name).title;
    const isFavorite = favorites.has(item.id);

    return (
      <TouchableOpacity
        onPress={() => selectTrack(actualIndex)}
        style={[styles.playlistItem, isActive && styles.activePlaylistItem]}
      >
        <Text style={styles.playlistIndex}>{actualIndex + 1}.</Text>
        <Text
          style={[styles.playlistItemText, isActive && styles.activePlaylistItemText]}
          numberOfLines={1}
        >
          {trackName}
        </Text>
        <TouchableOpacity
          onPress={() => toggleFavorite(item.id)}
          style={styles.favoriteButton}
        >
          <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteIconActive]}>
            {isFavorite ? '◆' : '◇'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surfaceAlt, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.playerLabel, { color: theme.colors.textPrimary }]}>{playerNumber === 1 ? 'Main' : 'Background'}</Text>

        {playlist ? (
            <View style={styles.headerSearchContainer}>
              <TextInput
                style={[styles.headerSearchInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
                placeholder={showFavoritesOnly ? "Search favorites..." : "Search tracks..."}
                placeholderTextColor={theme.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <AnimatedButton
                style={[styles.headerFavoriteButton, { backgroundColor: theme.colors.surface, borderColor: showFavoritesOnly ? theme.colors.primary : theme.colors.border }]}
                onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                <Text style={[styles.headerFavoriteIcon, { color: showFavoritesOnly ? theme.colors.primary : theme.colors.textPrimary }]}>
                  {showFavoritesOnly ? '◆' : '◇'}
                </Text>
              </AnimatedButton>
            </View>
        ) : (
            <View style={{flex: 1}} />
        )}

        <View style={styles.headerButtons}>
          <AnimatedButton onPress={onLoadPlaylist} style={[styles.loadButton, { backgroundColor: theme.colors.void }]}>
            <Text style={[styles.loadButtonText, { color: theme.colors.textPrimary }]}>◫</Text>
          </AnimatedButton>
        </View>
      </View>

      {/* Inline Playlist for Player 1 */}
      {playerNumber === 1 && playlist && (
        <View style={styles.inlinePlaylistContainer}>
            <FlatList
              data={getFilteredSortedTracks()}
              renderItem={renderPlaylistItem}
              keyExtractor={(item) => item.id}
              nestedScrollEnabled={true}
              style={styles.inlinePlaylistList}
            />
        </View>
      )}

      {/* Playlist - Track Count Button (Only for Player 2) */}
      {playerNumber !== 1 && playlist && playlist.tracks.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowPlaylist(true)}
          style={styles.playlistToggle}
        >
          <Text style={styles.playlistToggleText}>
            ▤ {playlist.tracks.length} tracks
          </Text>
        </TouchableOpacity>
      )}

      {/* Player Controls */}
      <View style={styles.playerArea}>
        {!playlist ? (
          <AnimatedButton
            style={styles.emptyStateContainer}
            onPress={onLoadPlaylist}
          >
            {isLoadingPlaylist ? (
              <>
                <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loadingIndicator} />
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading files...</Text>
              </>
            ) : (
              <>
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIconLarge}>◫</Text>
                  <View style={[styles.emptyIconPlusBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]}>
                    <Text style={[styles.emptyIconPlusText, { color: theme.colors.void }]}>+</Text>
                  </View>
                </View>
                <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>Tap to Load Music</Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                  {Platform.OS === 'web'
                    ? 'Select audio files to play'
                    : 'Choose a folder to start listening'}
                </Text>
              </>
            )}
          </AnimatedButton>
        ) : (
          <>
            {/* Main Content - Vertical Layout */}
            <View style={styles.mainContentContainer}>
              {/* Track Info */}
              <View style={styles.trackInfo}>
                <View style={styles.trackTitleRow}>
                  <ScrollingText 
                    text={trackInfo.title} 
                    isPlaying={isPlaying} 
                    style={styles.trackTitle} 
                  />
                  {currentTrack && (
                    <TouchableOpacity
                      onPress={() => toggleFavorite(currentTrack.id)}
                      style={styles.trackFavoriteButton}
                    >
                      <Text style={styles.trackFavoriteIcon}>
                        {favorites.has(currentTrack.id) ? '◆' : '◇'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Progress Bar with AB Repeat markers */}
              <View style={styles.progressContainer}>
                <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>{PlaylistService.formatTime(position)}</Text>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.progressSlider}
                    minimumValue={0}
                    maximumValue={duration || 1}
                    value={position}
                    onValueChange={handlePositionChange}
                    onSlidingComplete={handlePositionComplete}
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor={theme.colors.border}
                    thumbTintColor={theme.colors.primary}
                  />
                  {/* AB Repeat markers */}
                  {pointA !== null && duration > 0 && (
                    <View
                      style={[
                        styles.abMarker,
                        styles.markerA,
                        { left: `${(pointA / duration) * 100}%` },
                      ]}
                    />
                  )}
                  {pointB !== null && duration > 0 && (
                    <View
                      style={[
                        styles.abMarker,
                        styles.markerB,
                        { left: `${(pointB / duration) * 100}%` },
                      ]}
                    />
                  )}
                </View>
                <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>{PlaylistService.formatTime(duration)}</Text>
              </View>

              {/* AB Repeat indicator */}
              {abRepeatActive && (
                <View style={styles.abRepeatIndicator}>
                  <Text style={styles.abRepeatText}>
                    ⟳ A-B: {PlaylistService.formatTime(pointA || 0)} → {PlaylistService.formatTime(pointB || 0)}
                  </Text>
                </View>
              )}

              {/* Playback Controls */}
              <View style={styles.controlsSection}>
                <View style={styles.controls}>
                  <ControlButton
                    onPress={toggleShuffle}
                    icon="⤮"
                    isActive={shuffle}
                  />

                  <ControlButton
                    onPress={handlePrevious}
                    icon="◄◄"
                  />

                  <PlayButton
                    onPress={togglePlayPause}
                    isPlaying={isPlaying}
                    isLoading={isLoading}
                    size="medium"
                    disabled={isLoading}
                  />

                  <ControlButton
                    onPress={handleNext}
                    icon="►►"
                  />

                  <ControlButton
                    onPress={cycleRepeat}
                    icon={repeat === 'one' ? '⟳¹' : '⟳'}
                    isActive={repeat !== 'off'}
                  />
                </View>
              </View>

              {/* Secondary Controls Row */}
              <View style={[styles.secondaryControls, { borderTopColor: theme.colors.border }]}>
                {/* Volume Control */}
                <View style={[styles.controlGroupHorizontal, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <AnimatedButton
                    style={[styles.adjustButtonSmall, { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => handleVolumeChange(-0.1)}
                    disabled={volume <= 0}
                  >
                    <Text style={[styles.adjustButtonText, { color: theme.colors.textSecondary }]}>−</Text>
                  </AnimatedButton>

                  <View style={styles.valueDisplayCompact}>
                    <Text style={[styles.valueLabel, { color: theme.colors.textSecondary }]}>VOL</Text>
                    <Text style={[styles.valueTextCompact, { color: theme.colors.textPrimary }]}>{Math.round(volume * 100)}%</Text>
                  </View>

                  <AnimatedButton
                    style={[styles.adjustButtonSmall, { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => handleVolumeChange(0.1)}
                    disabled={volume >= 1}
                  >
                    <Text style={[styles.adjustButtonText, { color: theme.colors.textSecondary }]}>+</Text>
                  </AnimatedButton>
                </View>

                {/* Speed Control */}
                <View style={[styles.controlGroupHorizontal, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <AnimatedButton
                    style={[styles.adjustButtonSmall, { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => handleSpeedChange(-0.1)}
                    disabled={speed <= 0.5}
                  >
                    <Text style={[styles.adjustButtonText, { color: theme.colors.textSecondary }]}>−</Text>
                  </AnimatedButton>

                  <View style={styles.valueDisplayCompact}>
                    <Text style={[styles.valueLabel, { color: theme.colors.textSecondary }]}>SPEED</Text>
                    <Text style={[styles.valueTextCompact, { color: theme.colors.textPrimary }]}>{speed.toFixed(1)}×</Text>
                  </View>

                  <AnimatedButton
                    style={[styles.adjustButtonSmall, { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => handleSpeedChange(0.1)}
                    disabled={speed >= 2}
                  >
                    <Text style={[styles.adjustButtonText, { color: theme.colors.textSecondary }]}>+</Text>
                  </AnimatedButton>
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

            {/* Search and Sort Bar */}
            <View style={styles.searchSortBar}>
              <TextInput
                style={styles.searchInput}
                placeholder={showFavoritesOnly ? "Search favorites..." : "Search tracks..."}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <TouchableOpacity
                style={[styles.sortButton, showFavoritesOnly && styles.sortButtonActive]}
                onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                <Text style={[styles.sortButtonText, showFavoritesOnly && styles.sortButtonTextActive]}>
                  {showFavoritesOnly ? '◆' : '◇'}
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={getFilteredSortedTracks()}
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
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  playerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  headerSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSearchInput: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 36,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerFavoriteButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundTertiary,
  },
  headerFavoriteButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  headerFavoriteIcon: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerFavoriteIconActive: {
    color: colors.primary,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  loadButton: {
    backgroundColor: colors.background,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadButtonText: {
    fontSize: 18,
    color: colors.textPrimary,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
    alignItems: 'center',
  },
  activePlaylistItem: {
    backgroundColor: colors.primary + '20',
  },
  playlistIndex: {
    fontSize: 10,
    color: colors.textMuted,
    width: 28,
  },
  playlistItemText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  activePlaylistItemText: {
    color: colors.primary,
    fontWeight: '600',
  },
  favoriteButton: {
    padding: 4,
    marginLeft: 8,
  },
  favoriteIcon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  favoriteIconActive: {
    color: colors.warning, // Yellow for filled star
  },
  playerArea: {
    padding: 8,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    width: '100%',
  },
  emptyIconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  emptyIconLarge: {
    fontSize: 64,
    opacity: 0.8,
  },
  emptyIconPlusBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  emptyIconPlusText: {
    color: colors.background,
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: -2,
  },
  loadingIndicator: {
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 20,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  trackFavoriteButton: {
    padding: 4,
  },
  trackFavoriteIcon: {
    fontSize: 26, // Bigger star icon
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
  sliderContainer: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 8,
  },
  progressSlider: {
    width: '100%',
    height: 32,
  },
  abMarker: {
    position: 'absolute',
    top: 4,
    width: 3,
    height: 24,
    borderRadius: 2,
  },
  markerA: {
    backgroundColor: '#00ff00',
  },
  markerB: {
    backgroundColor: '#ff0000',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 40,
  },
  abRepeatIndicator: {
    backgroundColor: colors.primary + '20',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 8,
    alignSelf: 'center',
  },
  abRepeatText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
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
    width: 38, // Bigger
    height: 38, // Bigger
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8, // Adjust for new size
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    fontSize: 20, // Bigger
    fontWeight: 'bold',
    color: colors.textSecondary,
    lineHeight: 20, // Adjust for new font size
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
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
    width: '100%',
  },
  controlButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background, // Changed to black
    borderRadius: 0,
    borderWidth: 2, // Thicker border
    borderColor: colors.background, // Changed to black
    transform: [{ skewX: '-30deg' }], // More aggressive slant
  },
  controlButtonActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  controlIcon: {
    fontSize: 24,
    color: colors.skipButtonAccent,
    transform: [{ skewX: '30deg' }], // Counter-slant icon
  },
  controlIconSmall: {
    fontSize: 20,
    color: colors.textSecondary, // Inactive state
    transform: [{ skewX: '30deg' }], // Counter-slant icon
  },
  controlIconActive: {
    color: colors.textPrimary, // Active state
  },
  playButton: {
    backgroundColor: colors.background,
    borderRadius: 0, // Sharp corners
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: colors.primary, // Keep shadow primary for effect
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 3, // Thicker border for prominence
    borderColor: colors.background, // Match background
    transform: [{ skewX: '-30deg' }], // More aggressive slant
  },
  playIcon: {
    fontSize: 36,
    color: colors.primary,
    transform: [{ skewX: '30deg' }], // Counter-slant icon
  },
  extraControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  extraButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10, // Bigger
    paddingHorizontal: 15, // Bigger
    alignItems: 'center',
    minWidth: 70,
  },
  extraButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 2,
  },
  extraButtonText: {
    fontSize: 18, // Bigger
    color: colors.textPrimary,
    fontWeight: 'bold',
  },
  extraButtonLabel: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
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
    marginTop: 8,
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
    marginBottom: 12,
  },
  searchSortBar: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 44,
  },
  sortButtonText: {
    fontSize: 20, // Bigger sort icons, including favorite star
    color: colors.textPrimary,
  },
  sortButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  sortButtonTextActive: {
    color: colors.primary,
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
  inlinePlaylistContainer: {
    padding: 12,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inlinePlaylistList: {
    maxHeight: 400, // Restrict height so controls are visible
  },
});

SinglePlayer.displayName = 'SinglePlayer';

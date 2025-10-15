import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SinglePlayer, SinglePlayerRef } from '../components/SinglePlayer';
import { StorageService, Playlist, DualPlayerState } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { SleepTimer, SleepTimerDuration, SleepTimerState } from '../services/sleepTimer';
import { colors } from '../theme/colors';

export const MainPlayerScreen: React.FC = () => {
  const [playlist1, setPlaylist1] = useState<Playlist | null>(null);
  const [playlist2, setPlaylist2] = useState<Playlist | null>(null);
  const [dualState, setDualState] = useState<DualPlayerState | null>(null);
  const [activeMediaControlPlayer, setActiveMediaControlPlayer] = useState<1 | 2>(1);
  const [sleepTimerState, setSleepTimerState] = useState<SleepTimerState>({
    isActive: false,
    remainingSeconds: 0,
    totalSeconds: 0,
  });
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);

  const player1Ref = useRef<SinglePlayerRef>(null);
  const player2Ref = useRef<SinglePlayerRef>(null);
  const sleepTimer = SleepTimer.getInstance();

  // Load saved state on mount
  useEffect(() => {
    loadSavedState();
  }, []);

  // Subscribe to sleep timer updates
  useEffect(() => {
    const unsubscribe = sleepTimer.addListener((state) => {
      setSleepTimerState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle sleep timer completion - pause both players
  const handleSleepTimerComplete = useCallback(async () => {
    try {
      // Pause both players
      await Promise.all([
        player1Ref.current?.pause(),
        player2Ref.current?.pause(),
      ]);

      if (Platform.OS !== 'web') {
        Alert.alert('Sleep Timer', 'Sleep timer finished - playback stopped');
      }
    } catch (error) {
      console.error('Error pausing players:', error);
    }
  }, []);

  const loadSavedState = async () => {
    try {
      const saved = await StorageService.getDualPlayerState();
      if (saved) {
        setDualState(saved);

        // Load playlists from saved state
        if (saved.player1.playlistId) {
          const p1 = await StorageService.getPlaylist(saved.player1.playlistId);
          if (p1) setPlaylist1(p1);
        }
        if (saved.player2.playlistId) {
          const p2 = await StorageService.getPlaylist(saved.player2.playlistId);
          if (p2) setPlaylist2(p2);
        }
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
    }
  };

  const handleLoadPlaylist = async (playerNumber: 1 | 2) => {
    try {
      // Pick multiple files directly
      const { tracks, selectedIndex } = await PlaylistService.pickAudioFileAndFolder();

      if (tracks.length === 0) return;

      // Extract folder name from the first track's URI
      const uri = tracks[0].uri;
      const lastSlash = uri.lastIndexOf('/');
      const folderPath = lastSlash >= 0 ? uri.substring(0, lastSlash) : uri;
      const name = folderPath.split('/').pop() || 'Folder';

      const playlist = await StorageService.savePlaylist({
        name,
        tracks,
      });

      if (playerNumber === 1) {
        setPlaylist1(playlist);
        // Update initial state to start at the selected track
        setDualState(prev => ({
          ...prev,
          player1: {
            ...(prev?.player1 || {
              playlistId: playlist.id,
              currentTrackIndex: selectedIndex,
              position: 0,
              volume: 0.25,
              speed: 1,
              isPlaying: false,
              shuffle: false,
              repeat: 'off' as const,
            }),
            playlistId: playlist.id,
            currentTrackIndex: selectedIndex,
          },
        } as DualPlayerState));
      } else {
        setPlaylist2(playlist);
        // Update initial state to start at the selected track
        setDualState(prev => ({
          ...prev,
          player2: {
            ...(prev?.player2 || {
              playlistId: playlist.id,
              currentTrackIndex: selectedIndex,
              position: 0,
              volume: 1,
              speed: 1,
              isPlaying: false,
              shuffle: false,
              repeat: 'off' as const,
            }),
            playlistId: playlist.id,
            currentTrackIndex: selectedIndex,
          },
        } as DualPlayerState));
      }

      if (Platform.OS !== 'web') {
        Alert.alert(
          'Success',
          `Loaded ${tracks.length} track${tracks.length !== 1 ? 's' : ''} from folder.`
        );
      }
    } catch (error) {
      console.error('Error picking files:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to load audio files');
      }
    }
  };

  const handlePlayer1StateChange = useCallback(
    (state: any) => {
      const newDualState = {
        player1: state,
        player2: dualState?.player2 || {
          playlistId: undefined,
          currentTrackIndex: 0,
          position: 0,
          volume: 1,
          speed: 1,
          isPlaying: false,
          shuffle: false,
          repeat: 'off' as const,
        },
      };
      setDualState(newDualState);
      StorageService.saveDualPlayerState(newDualState);

      // If player 1 starts playing, make it the active media control player
      if (state.isPlaying && activeMediaControlPlayer !== 1) {
        setActiveMediaControlPlayer(1);
      }
    },
    [dualState, activeMediaControlPlayer]
  );

  const handlePlayer2StateChange = useCallback(
    (state: any) => {
      const newDualState = {
        player1: dualState?.player1 || {
          playlistId: undefined,
          currentTrackIndex: 0,
          position: 0,
          volume: 0.25,
          speed: 1,
          isPlaying: false,
          shuffle: false,
          repeat: 'off' as const,
        },
        player2: state,
      };
      setDualState(newDualState);
      StorageService.saveDualPlayerState(newDualState);

      // If player 2 starts playing, make it the active media control player
      if (state.isPlaying && activeMediaControlPlayer !== 2) {
        setActiveMediaControlPlayer(2);
      }
    },
    [dualState, activeMediaControlPlayer]
  );

  const handleStartSleepTimer = (minutes: SleepTimerDuration) => {
    sleepTimer.start(minutes, handleSleepTimerComplete);
    setShowSleepTimerModal(false);
    if (Platform.OS !== 'web') {
      Alert.alert('Sleep Timer', `Timer set for ${minutes} minutes`);
    }
  };

  const handleStopSleepTimer = () => {
    sleepTimer.stop();
    if (Platform.OS !== 'web') {
      Alert.alert('Sleep Timer', 'Timer cancelled');
    }
  };

  const sleepTimerDurations: SleepTimerDuration[] = [5, 10, 15, 30, 45, 60, 90, 120];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>MyMix - Dual MP3 Player</Text>
            <Text style={styles.subtitle}>Play two audio tracks simultaneously</Text>
          </View>
          <TouchableOpacity
            style={styles.sleepTimerButton}
            onPress={() => setShowSleepTimerModal(true)}
          >
            <Text style={styles.sleepTimerIcon}>😴</Text>
            {sleepTimerState.isActive && (
              <Text style={styles.sleepTimerText}>
                {sleepTimer.formatTime(sleepTimerState.remainingSeconds)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <SinglePlayer
          ref={player1Ref}
          playlist={playlist1}
          playerNumber={1}
          initialState={dualState?.player1}
          onStateChange={handlePlayer1StateChange}
          onLoadPlaylist={() => handleLoadPlaylist(1)}
          isActiveMediaControl={activeMediaControlPlayer === 1}
        />

        <SinglePlayer
          ref={player2Ref}
          playlist={playlist2}
          playerNumber={2}
          initialState={dualState?.player2}
          onStateChange={handlePlayer2StateChange}
          onLoadPlaylist={() => handleLoadPlaylist(2)}
          isActiveMediaControl={activeMediaControlPlayer === 2}
        />
      </ScrollView>

      {/* Sleep Timer Modal */}
      <Modal
        visible={showSleepTimerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSleepTimerModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSleepTimerModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Sleep Timer</Text>
            <Text style={styles.modalSubtitle}>Playback will stop after:</Text>

            <View style={styles.timerGrid}>
              {sleepTimerDurations.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={styles.timerOption}
                  onPress={() => handleStartSleepTimer(minutes)}
                >
                  <Text style={styles.timerOptionText}>{minutes} min</Text>
                </TouchableOpacity>
              ))}
            </View>

            {sleepTimerState.isActive && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleStopSleepTimer}
              >
                <Text style={styles.cancelButtonText}>Cancel Timer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowSleepTimerModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 40,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sleepTimerButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sleepTimerIcon: {
    fontSize: 20,
  },
  sleepTimerText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  timerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timerOption: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancelButton: {
    backgroundColor: colors.error || '#EF4444',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

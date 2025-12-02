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
  TextInput,
  FlatList,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from 'react-native';
import * as Updates from 'expo-updates';
import { SinglePlayer, SinglePlayerRef } from '../components/SinglePlayer';
import { StorageService, Playlist, DualPlayerState, Preset } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { SleepTimer, SleepTimerDuration, SleepTimerState } from '../services/sleepTimer';
import { colors } from '../theme/colors';
import { BUILD_DATE } from '../constants/BuildInfo';

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
  const [showMenu, setShowMenu] = useState(false);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [isLoadingInitialState, setIsLoadingInitialState] = useState(true);
  const [isLinked, setIsLinked] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const player1Ref = useRef<SinglePlayerRef>(null);
  const player2Ref = useRef<SinglePlayerRef>(null);
  const sleepTimer = SleepTimer.getInstance();

  // Load saved state and presets on mount
  useEffect(() => {
    loadSavedState();
    loadPresets();
  }, []);

  const loadPresets = async () => {
    const presets = await StorageService.getAllPresets();
    setSavedPresets(presets);
  };

  // Subscribe to sleep timer updates
  useEffect(() => {
    const unsubscribe = sleepTimer.addListener((state) => {
      setSleepTimerState(state);

      // Check if timer completed while we weren't listening
      if (state.isActive && state.remainingSeconds <= 0) {
        handleSleepTimerComplete();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle app state changes to check timer when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Check timer state when app becomes active
        const currentState = sleepTimer.getState();
        setSleepTimerState(currentState);

        // If timer should have completed, trigger completion
        if (currentState.isActive && currentState.remainingSeconds <= 0) {
          handleSleepTimerComplete();
        }
      }
    });

    return () => {
      subscription.remove();
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

      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Sleep Timer', 'Sleep timer finished - playback stopped');
      }
    } catch (error) {
      console.error('Error pausing players:', error);
    }
  }, []);

  const loadSavedState = async () => {
    try {
      setIsLoadingInitialState(true);
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
    } finally {
      setIsLoadingInitialState(false);
    }
  };

  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<1 | 2 | null>(null);

  const handleLoadPlaylist = async (playerNumber: 1 | 2) => {
    try {
      console.log('[MainPlayerScreen] Loading playlist for player', playerNumber);
      setIsLoadingPlaylist(playerNumber);

      // Pick multiple files directly
      const { tracks, selectedIndex } = await PlaylistService.pickAudioFileAndFolder();

      console.log('[MainPlayerScreen] Picked', tracks.length, 'tracks');

      if (tracks.length === 0) {
        console.log('[MainPlayerScreen] No tracks selected, user likely cancelled');
        setIsLoadingPlaylist(null);
        return;
      }

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
    } catch (error) {
      console.error('Error picking files:', error);
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Error', 'Failed to load audio files');
      }
    } finally {
      setIsLoadingPlaylist(null);
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

      // Main player is always the active media control player
      if (activeMediaControlPlayer !== 1) {
        setActiveMediaControlPlayer(1);
      }

      // Auto-start Background when Main starts playing
      if (isLinked && state.isPlaying && !dualState?.player2.isPlaying && playlist2) {
        player2Ref.current?.play();
      }

      // Auto-pause Background when Main pauses
      if (isLinked && !state.isPlaying && dualState?.player2.isPlaying) {
        player2Ref.current?.pause();
      }
    },
    [dualState, activeMediaControlPlayer, playlist2, isLinked]
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
    },
    [dualState, activeMediaControlPlayer]
  );

  const handleStartSleepTimer = (minutes: SleepTimerDuration) => {
    sleepTimer.start(minutes, handleSleepTimerComplete);
    setShowSleepTimerModal(false);
    if ((Platform.OS as string) !== 'web') {
      Alert.alert('Sleep Timer', `Timer set for ${minutes} minutes`);
    }
  };

  const handleStopSleepTimer = () => {
    sleepTimer.stop();
    if ((Platform.OS as string) !== 'web') {
      Alert.alert('Sleep Timer', 'Timer cancelled');
    }
  };

  const checkForUpdate = async () => {
    try {
      setIsCheckingForUpdate(true);

      // Check if running in development mode
      if (__DEV__) {
        if ((Platform.OS as string) !== 'web') {
          Alert.alert(
            'Development Mode',
            'Updates are not available in development mode. Build and run a production version to check for updates.'
          );
        } else {
          alert('Updates are not available in development mode.');
        }
        setIsCheckingForUpdate(false);
        return;
      }

      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        if ((Platform.OS as string) !== 'web') {
          Alert.alert(
            'Update Available',
            'A new version of the app is available. Would you like to download and install it now?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setIsCheckingForUpdate(false),
              },
              {
                text: 'Update',
                onPress: async () => {
                  try {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    Alert.alert('Error', `Failed to fetch update: ${errorMessage}`);
                    setIsCheckingForUpdate(false);
                  }
                },
              },
            ]
          );
        } else {
          if (confirm('A new version is available. Reload now?')) {
             window.location.reload();
          }
           setIsCheckingForUpdate(false);
        }
      } else {
        if ((Platform.OS as string) !== 'web') {
          Alert.alert('No Update', 'You are already running the latest version.');
        } else {
           alert('You are already running the latest version.');
        }
        setIsCheckingForUpdate(false);
      }
    } catch (error) {
      console.error('Error checking for update:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Error', `Failed to check for updates: ${errorMessage}`);
      } else {
        alert(`Failed to check for updates: ${errorMessage}`);
      }
      setIsCheckingForUpdate(false);
    }
  };


  const sleepTimerDurations: SleepTimerDuration[] = [5, 10, 15, 30, 45, 60, 90, 120];

  // Auto-save preset when name changes
  const handlePresetNameChange = (name: string) => {
    setPresetName(name);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only save if name is not empty and we have at least one playlist
    if (name.trim() && (playlist1 || playlist2) && dualState) {
      // Debounce save by 1 second
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await StorageService.savePreset(name.trim(), dualState, playlist1 || undefined, playlist2 || undefined);
          await loadPresets(); // Reload presets list
          console.log('[MainPlayerScreen] Auto-saved preset:', name);
        } catch (error) {
          console.error('[MainPlayerScreen] Error auto-saving preset:', error);
        }
      }, 1000);
    }
  };

  // Load a preset
  const handleLoadPreset = async (preset: Preset) => {
    try {
      setIsLoadingPreset(true);
      console.log('[MainPlayerScreen] Loading preset:', preset.name);

      // Set preset name
      setPresetName(preset.name);

      // Load playlists
      if (preset.playlist1) {
        setPlaylist1(preset.playlist1);
      }
      if (preset.playlist2) {
        setPlaylist2(preset.playlist2);
      }

      // Load dual player state
      setDualState(preset.dualPlayerState);

      // Update last used
      await StorageService.updatePresetLastUsed(preset.id);
      await loadPresets();

      setShowPresetsModal(false);
    } catch (error) {
      console.error('[MainPlayerScreen] Error loading preset:', error);
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Error', 'Failed to load preset');
      }
    } finally {
      setIsLoadingPreset(false);
    }
  };

  // Delete a preset
  const handleDeletePreset = async (id: string, name: string) => {
    if ((Platform.OS as string) !== 'web') {
      Alert.alert(
        'Delete Preset',
        `Delete "${name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await StorageService.deletePreset(id);
                await loadPresets();
              } catch (error) {
                console.error('[MainPlayerScreen] Error deleting preset:', error);
              }
            },
          },
        ]
      );
    } else {
      if (confirm(`Delete preset "${name}"?`)) {
        try {
          await StorageService.deletePreset(id);
          await loadPresets();
        } catch (error) {
          console.error('[MainPlayerScreen] Error deleting preset:', error);
        }
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>MyMix</Text>
          </View>
          
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowPresetsModal(true)}
            >
              <Text style={styles.headerActionIcon}>📋</Text>
              {savedPresets.length > 0 && (
                <View style={styles.presetsBadge}>
                  <Text style={styles.presetsBadgeText}>{savedPresets.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.headerActionButton, !isLinked && styles.inactiveLinkButton]}
              onPress={() => setIsLinked(!isLinked)}
            >
              <Text style={styles.headerActionIcon}>{isLinked ? '🔗' : '🔓'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerActionButton, sleepTimerState.isActive && styles.activeSleepTimer]}
              onPress={() => setShowSleepTimerModal(true)}
            >
              <Text style={styles.headerActionIcon}>😴</Text>
              {sleepTimerState.isActive && (
                <Text style={styles.sleepTimerText}>
                  {sleepTimer.formatTime(sleepTimerState.remainingSeconds)}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowMenu(true)}
            >
              <Text style={styles.headerActionIcon}>☰</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preset Name Input */}
        <View style={styles.presetInputWrapper}>
          <View style={styles.presetNameContainer}>
            <Text style={styles.presetNameIcon}>💾</Text>
            <TextInput
              style={styles.presetNameInput}
              placeholder="Name this mix..."
              placeholderTextColor={colors.textMuted}
              value={presetName}
              onChangeText={handlePresetNameChange}
            />
            {presetName.trim() ? (
              <View style={styles.saveStatusContainer}>
                <Text style={styles.autoSaveText}>Saved</Text>
                <Text style={styles.autoSaveIndicator}>✓</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {isLoadingInitialState ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your music...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <SinglePlayer
            ref={player1Ref}
            playlist={playlist1}
            playerNumber={1}
            initialState={dualState?.player1}
            onStateChange={handlePlayer1StateChange}
            onLoadPlaylist={() => handleLoadPlaylist(1)}
            isActiveMediaControl={activeMediaControlPlayer === 1}
            isLoadingPlaylist={isLoadingPlaylist === 1}
            playbackGroupId="main-players"
          />

          <SinglePlayer
            ref={player2Ref}
            playlist={playlist2}
            playerNumber={2}
            initialState={dualState?.player2}
            onStateChange={handlePlayer2StateChange}
            onLoadPlaylist={() => handleLoadPlaylist(2)}
            isActiveMediaControl={activeMediaControlPlayer === 2}
            isLoadingPlaylist={isLoadingPlaylist === 2}
            playbackGroupId="main-players"
          />
        </ScrollView>
      )}

      {/* Main Menu Modal */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Menu</Text>
            
            <View style={styles.menuSection}>
              <Text style={styles.menuLabel}>App Version</Text>
              <Text style={styles.menuValue}>Build: {BUILD_DATE}</Text>
            </View>

            <TouchableOpacity
              style={styles.updateButton}
              onPress={checkForUpdate}
              disabled={isCheckingForUpdate}
            >
              {isCheckingForUpdate ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.updateButtonText}>Check for Updates</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

      {/* Presets Modal */}
      <Modal
        visible={showPresetsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPresetsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPresetsModal(false)}
        >
          <View style={styles.presetsModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Saved Presets</Text>
            <Text style={styles.modalSubtitle}>
              {savedPresets.length} saved configuration{savedPresets.length !== 1 ? 's' : ''}
            </Text>

            {savedPresets.length === 0 ? (
              <View style={styles.emptyPresets}>
                <Text style={styles.emptyPresetsText}>No saved presets yet</Text>
                <Text style={styles.emptyPresetsSubtext}>
                  Enter a name above to save your current setup
                </Text>
              </View>
            ) : (
              <FlatList
                data={savedPresets}
                keyExtractor={(item) => item.id}
                style={styles.presetsList}
                renderItem={({ item }) => (
                  <View style={styles.presetItem}>
                    <TouchableOpacity
                      style={styles.presetItemButton}
                      onPress={() => handleLoadPreset(item)}
                      disabled={isLoadingPreset}
                    >
                      <View style={styles.presetItemInfo}>
                        <Text style={styles.presetItemName}>{item.name}</Text>
                        <Text style={styles.presetItemDetails}>
                          {item.playlist1 && `P1: ${item.playlist1.name}`}
                          {item.playlist1 && item.playlist2 && ' • '}
                          {item.playlist2 && `P2: ${item.playlist2.name}`}
                        </Text>
                      </View>
                      {isLoadingPreset && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deletePresetButton}
                      onPress={() => handleDeletePreset(item.id, item.name)}
                    >
                      <Text style={styles.deletePresetText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowPresetsModal(false)}
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  headerActionButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  activeSleepTimer: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  inactiveLinkButton: {
    borderColor: colors.textMuted,
    opacity: 0.7,
  },
  headerActionIcon: {
    fontSize: 20,
  },
  presetsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.backgroundSecondary,
  },
  presetsBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.background,
  },
  sleepTimerText: {
    position: 'absolute',
    bottom: 2,
    fontSize: 8,
    color: colors.primary,
    fontWeight: 'bold',
  },
  presetInputWrapper: {
    marginTop: 4,
  },
  presetNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetNameIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.7,
  },
  presetNameInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
    height: 24,
  },
  saveStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.primary + '10',
    borderRadius: 4,
  },
  autoSaveText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    marginRight: 2,
  },
  autoSaveIndicator: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuSection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  menuValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  updateButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.background,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
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
    borderRadius: 12,
    paddingVertical: 16,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  presetsModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetsList: {
    maxHeight: 400,
    marginBottom: 16,
  },
  presetItem: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  presetItemButton: {
    flex: 1,
    padding: 12,
  },
  presetItemInfo: {
    flex: 1,
  },
  presetItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  presetItemDetails: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  deletePresetButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  deletePresetText: {
    fontSize: 18,
  },
  emptyPresets: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyPresetsText: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptyPresetsSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});

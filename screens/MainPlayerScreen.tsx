import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SinglePlayer } from '../components/SinglePlayer';
import { StorageService, Playlist, DualPlayerState } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { colors } from '../theme/colors';

export const MainPlayerScreen: React.FC = () => {
  const [playlist1, setPlaylist1] = useState<Playlist | null>(null);
  const [playlist2, setPlaylist2] = useState<Playlist | null>(null);
  const [dualState, setDualState] = useState<DualPlayerState | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2>(1);
  const [playlistName, setPlaylistName] = useState('');
  const [savedPlaylists, setSavedPlaylists] = useState<Playlist[]>([]);

  // Load saved state on mount
  useEffect(() => {
    loadSavedState();
    loadSavedPlaylists();
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

  const loadSavedPlaylists = async () => {
    try {
      const playlists = await StorageService.getAllPlaylists();
      setSavedPlaylists(playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  };

  const handleLoadPlaylist = (playerNumber: 1 | 2) => {
    setSelectedPlayer(playerNumber);
    setShowPlaylistModal(true);
    setPlaylistName('');
  };

  const handlePickFiles = async () => {
    try {
      const tracks = await PlaylistService.pickAudioFiles();
      if (tracks.length === 0) return;

      const name = playlistName.trim() || `Playlist ${Date.now()}`;
      const playlist = await StorageService.savePlaylist({
        name,
        tracks,
      });

      if (selectedPlayer === 1) {
        setPlaylist1(playlist);
      } else {
        setPlaylist2(playlist);
      }

      setShowPlaylistModal(false);
      loadSavedPlaylists();

      if (Platform.OS !== 'web') {
        Alert.alert('Success', `Loaded ${tracks.length} tracks`);
      }
    } catch (error) {
      console.error('Error picking files:', error);
      Alert.alert('Error', 'Failed to load audio files');
    }
  };

  const handleSelectSavedPlaylist = async (playlist: Playlist) => {
    // Update last played timestamp
    await StorageService.updatePlaylist(playlist.id, {
      lastPlayed: Date.now(),
    });

    if (selectedPlayer === 1) {
      setPlaylist1(playlist);
    } else {
      setPlaylist2(playlist);
    }

    setShowPlaylistModal(false);
    loadSavedPlaylists();
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm('Delete this playlist?')
        : await new Promise<boolean>(resolve => {
            Alert.alert('Delete Playlist', 'Are you sure?', [
              { text: 'Cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });

    if (!confirmed) return;

    try {
      await StorageService.deletePlaylist(playlistId);

      // Clear from players if loaded
      if (playlist1?.id === playlistId) setPlaylist1(null);
      if (playlist2?.id === playlistId) setPlaylist2(null);

      loadSavedPlaylists();
    } catch (error) {
      console.error('Error deleting playlist:', error);
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
    },
    [dualState]
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
    [dualState]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>MyMix - Dual MP3 Player</Text>
        <Text style={styles.subtitle}>Play two audio tracks simultaneously</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <SinglePlayer
          playlist={playlist1}
          playerNumber={1}
          initialState={dualState?.player1}
          onStateChange={handlePlayer1StateChange}
          onLoadPlaylist={() => handleLoadPlaylist(1)}
        />

        <SinglePlayer
          playlist={playlist2}
          playerNumber={2}
          initialState={dualState?.player2}
          onStateChange={handlePlayer2StateChange}
          onLoadPlaylist={() => handleLoadPlaylist(2)}
        />
      </ScrollView>

      {/* Playlist Selection Modal */}
      <Modal
        visible={showPlaylistModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Load Playlist</Text>
              <TouchableOpacity onPress={() => setShowPlaylistModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>New Playlist</Text>
              <TextInput
                style={styles.input}
                placeholder="Playlist name (optional)"
                placeholderTextColor={colors.textMuted}
                value={playlistName}
                onChangeText={setPlaylistName}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={handlePickFiles}>
                <Text style={styles.primaryButtonText}>📂 Pick Audio Files</Text>
              </TouchableOpacity>
            </View>

            {savedPlaylists.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Saved Playlists</Text>
                <ScrollView style={styles.playlistList}>
                  {savedPlaylists.map(playlist => (
                    <View key={playlist.id} style={styles.savedPlaylistItem}>
                      <TouchableOpacity
                        style={styles.playlistInfo}
                        onPress={() => handleSelectSavedPlaylist(playlist)}
                      >
                        <Text style={styles.playlistName}>{playlist.name}</Text>
                        <Text style={styles.playlistMeta}>
                          {playlist.tracks.length} tracks
                          {playlist.lastPlayed &&
                            ` • ${new Date(playlist.lastPlayed).toLocaleDateString()}`}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeletePlaylist(playlist.id)}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteButtonText}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: 24,
    color: colors.textMuted,
  },
  modalSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  playlistList: {
    maxHeight: 300,
  },
  savedPlaylistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    padding: 12,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  playlistMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 20,
  },
});

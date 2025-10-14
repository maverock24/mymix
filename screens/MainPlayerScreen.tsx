import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SinglePlayer } from '../components/SinglePlayer';
import { StorageService, Playlist, DualPlayerState } from '../services/storage';
import { PlaylistService } from '../services/playlistService';
import { colors } from '../theme/colors';

export const MainPlayerScreen: React.FC = () => {
  const [playlist1, setPlaylist1] = useState<Playlist | null>(null);
  const [playlist2, setPlaylist2] = useState<Playlist | null>(null);
  const [dualState, setDualState] = useState<DualPlayerState | null>(null);

  // Load saved state on mount
  useEffect(() => {
    loadSavedState();
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
      const folderName = PlaylistService.getFolderPath(tracks[0].uri).split('/').pop() || 'Folder';
      const name = folderName;

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
        Alert.alert('Success', `Loaded ${tracks.length} tracks`);
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
});

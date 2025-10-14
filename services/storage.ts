import localforage from 'localforage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type RepeatMode = 'off' | 'all' | 'one';

export interface Track {
  id: string;
  name: string;
  uri: string;
  duration?: number;
  data?: Blob; // For web only
  type: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  folderUri?: string;
  createdAt: number;
  lastPlayed?: number;
}

export interface PlayerState {
  playlistId?: string;
  currentTrackIndex: number;
  position: number;
  volume: number;
  speed: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  shuffledIndices?: number[];
}

export interface DualPlayerState {
  player1: PlayerState;
  player2: PlayerState;
}

// Initialize localforage (for web only)
const playlistStore = localforage.createInstance({
  name: 'mymix',
  storeName: 'playlists',
});

const playerStateStore = localforage.createInstance({
  name: 'mymix',
  storeName: 'playerState',
});

const PLAYLISTS_KEY = '@mymix_playlists';
const PLAYER_STATE_KEY = '@mymix_player_state';

export const StorageService = {
  // Playlist Management
  async savePlaylist(playlist: Omit<Playlist, 'id' | 'createdAt'>): Promise<Playlist> {
    const newPlaylist: Playlist = {
      ...playlist,
      id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };

    if (Platform.OS === 'web') {
      await playlistStore.setItem(newPlaylist.id, newPlaylist);
    } else {
      const allPlaylists = await this.getAllPlaylists();
      allPlaylists.push(newPlaylist);
      await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(allPlaylists));
    }

    return newPlaylist;
  },

  async getAllPlaylists(): Promise<Playlist[]> {
    if (Platform.OS === 'web') {
      const playlists: Playlist[] = [];
      await playlistStore.iterate((value: Playlist) => {
        playlists.push(value);
      });
      return playlists.sort((a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt));
    } else {
      const data = await AsyncStorage.getItem(PLAYLISTS_KEY);
      if (!data) return [];
      const playlists: Playlist[] = JSON.parse(data);
      return playlists.sort((a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt));
    }
  },

  async getPlaylist(id: string): Promise<Playlist | null> {
    if (Platform.OS === 'web') {
      return await playlistStore.getItem<Playlist>(id);
    } else {
      const allPlaylists = await this.getAllPlaylists();
      return allPlaylists.find(p => p.id === id) || null;
    }
  },

  async updatePlaylist(id: string, updates: Partial<Playlist>): Promise<Playlist | null> {
    if (Platform.OS === 'web') {
      const existing = await playlistStore.getItem<Playlist>(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates, id };
      await playlistStore.setItem(id, updated);
      return updated;
    } else {
      const allPlaylists = await this.getAllPlaylists();
      const index = allPlaylists.findIndex(p => p.id === id);
      if (index === -1) return null;
      const updated = { ...allPlaylists[index], ...updates, id };
      allPlaylists[index] = updated;
      await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(allPlaylists));
      return updated;
    }
  },

  async deletePlaylist(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      await playlistStore.removeItem(id);
    } else {
      const allPlaylists = await this.getAllPlaylists();
      const filtered = allPlaylists.filter(p => p.id !== id);
      await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(filtered));
    }
  },

  // Player State Management
  async saveDualPlayerState(state: DualPlayerState): Promise<void> {
    if (Platform.OS === 'web') {
      await playerStateStore.setItem('dualPlayerState', state);
    } else {
      await AsyncStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
    }
  },

  async getDualPlayerState(): Promise<DualPlayerState | null> {
    if (Platform.OS === 'web') {
      return await playerStateStore.getItem<DualPlayerState>('dualPlayerState');
    } else {
      const data = await AsyncStorage.getItem(PLAYER_STATE_KEY);
      return data ? JSON.parse(data) : null;
    }
  },

  async clearPlayerState(): Promise<void> {
    if (Platform.OS === 'web') {
      await playerStateStore.removeItem('dualPlayerState');
    } else {
      await AsyncStorage.removeItem(PLAYER_STATE_KEY);
    }
  },

  async clearAll(): Promise<void> {
    if (Platform.OS === 'web') {
      await playlistStore.clear();
      await playerStateStore.clear();
    } else {
      await AsyncStorage.removeItem(PLAYLISTS_KEY);
      await AsyncStorage.removeItem(PLAYER_STATE_KEY);
    }
  },
};

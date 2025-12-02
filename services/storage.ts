import localforage from 'localforage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type RepeatMode = 'off' | 'all' | 'one';

export interface Track {
  id: string;
  name: string;
  uri: string;
  duration?: number;
  data?: Blob; // For legacy/fallback (store full file)
  fileHandle?: FileSystemFileHandle | any; // For optimized folder loading
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

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  lastUsed?: number;
  dualPlayerState: DualPlayerState;
  playlist1?: Playlist;
  playlist2?: Playlist;
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

const presetsStore = localforage.createInstance({
  name: 'mymix',
  storeName: 'presets',
});

const PLAYLISTS_KEY = '@mymix_playlists';
const PLAYER_STATE_KEY = '@mymix_player_state';
const PRESETS_KEY = '@mymix_presets';
const MAX_WEB_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB limit

const getPlaylistSize = (playlist: Playlist): number => {
  let size = 0;
  if (playlist.tracks) {
    playlist.tracks.forEach(track => {
      if (track.data) {
        size += track.data.size;
      }
      // fileHandle takes negligible space in storage
    });
  }
  return size;
};

const getPresetSize = (preset: Preset): number => {
  let size = 0;
  if (preset.playlist1) size += getPlaylistSize(preset.playlist1);
  if (preset.playlist2) size += getPlaylistSize(preset.playlist2);
  return size;
};

const enforceWebStorageLimit = async (requiredBytes: number): Promise<void> => {
  if (Platform.OS !== 'web') return;

  let totalSize = 0;
  const items: { id: string; size: number; lastUsed: number; type: 'playlist' | 'preset' }[] = [];

  // Count Playlists
  await playlistStore.iterate((playlist: Playlist) => {
    const size = getPlaylistSize(playlist);
    totalSize += size;
    items.push({
      id: playlist.id,
      size,
      lastUsed: playlist.lastPlayed || playlist.createdAt,
      type: 'playlist',
    });
  });

  // Count Presets
  await presetsStore.iterate((preset: Preset) => {
    const size = getPresetSize(preset);
    totalSize += size;
    items.push({
      id: preset.id,
      size,
      lastUsed: preset.lastUsed || preset.createdAt,
      type: 'preset',
    });
  });

  if (totalSize + requiredBytes > MAX_WEB_STORAGE_BYTES) {
    // Sort by lastUsed (oldest first)
    items.sort((a, b) => a.lastUsed - b.lastUsed);

    let deletedSize = 0;
    for (const item of items) {
      if (totalSize - deletedSize + requiredBytes <= MAX_WEB_STORAGE_BYTES) {
        break;
      }
      
      if (item.type === 'playlist') {
        await playlistStore.removeItem(item.id);
      } else {
        await presetsStore.removeItem(item.id);
      }
      
      deletedSize += item.size;
      console.log(`[Storage] Evicted ${item.type} ${item.id} to free up ${item.size} bytes`);
    }
  }
};

export const StorageService = {
  // Playlist Management
  async savePlaylist(playlist: Omit<Playlist, 'id' | 'createdAt'>): Promise<Playlist> {
    try {
      const newPlaylist: Playlist = {
        ...playlist,
        id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      };

      if (Platform.OS === 'web') {
        const newSize = getPlaylistSize(newPlaylist);
        await enforceWebStorageLimit(newSize);
        await playlistStore.setItem(newPlaylist.id, newPlaylist);
      } else {
        const allPlaylists = await this.getAllPlaylists();
        allPlaylists.push(newPlaylist);
        await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(allPlaylists));
        console.log('[Storage] Saved playlist:', newPlaylist.name, 'with', newPlaylist.tracks.length, 'tracks');
      }

      return newPlaylist;
    } catch (error) {
      console.error('[Storage] Error saving playlist:', error);
      throw error;
    }
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
    try {
      if (Platform.OS === 'web') {
        await playerStateStore.setItem('dualPlayerState', state);
      } else {
        const stateString = JSON.stringify(state);
        await AsyncStorage.setItem(PLAYER_STATE_KEY, stateString);
        console.log('[Storage] Saved dual player state:', PLAYER_STATE_KEY);
      }
    } catch (error) {
      console.error('[Storage] Error saving dual player state:', error);
      throw error;
    }
  },

  async getDualPlayerState(): Promise<DualPlayerState | null> {
    try {
      if (Platform.OS === 'web') {
        return await playerStateStore.getItem<DualPlayerState>('dualPlayerState');
      } else {
        const data = await AsyncStorage.getItem(PLAYER_STATE_KEY);
        if (data) {
          console.log('[Storage] Retrieved dual player state:', PLAYER_STATE_KEY);
          return JSON.parse(data);
        }
        console.log('[Storage] No saved dual player state found');
        return null;
      }
    } catch (error) {
      console.error('[Storage] Error retrieving dual player state:', error);
      return null;
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

  // Preset Management
  async savePreset(
    name: string,
    dualPlayerState: DualPlayerState,
    playlist1?: Playlist,
    playlist2?: Playlist
  ): Promise<Preset> {
    try {
      // Check if preset with same name already exists
      const allPresets = await this.getAllPresets();
      const existingPreset = allPresets.find(p => p.name === name);

      let preset: Preset;

      if (existingPreset) {
        // Update existing preset
        preset = {
          ...existingPreset,
          name,
          lastUsed: Date.now(),
          dualPlayerState,
          playlist1,
          playlist2,
        };
      } else {
        // Create new preset
        preset = {
          id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          dualPlayerState,
          playlist1,
          playlist2,
        };
      }

      if (Platform.OS === 'web') {
        const newSize = getPresetSize(preset);
        await enforceWebStorageLimit(newSize);
        await presetsStore.setItem(preset.id, preset);
      } else {
        const updatedPresets = allPresets.filter(p => p.id !== preset.id);
        updatedPresets.push(preset);
        await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(updatedPresets));
        console.log('[Storage] Saved preset:', name, existingPreset ? '(updated)' : '(new)');
      }

      return preset;
    } catch (error) {
      console.error('[Storage] Error saving preset:', error);
      throw error;
    }
  },

  async getAllPresets(): Promise<Preset[]> {
    try {
      if (Platform.OS === 'web') {
        const presets: Preset[] = [];
        await presetsStore.iterate((value: Preset) => {
          presets.push(value);
        });
        return presets.sort((a, b) => (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt));
      } else {
        const data = await AsyncStorage.getItem(PRESETS_KEY);
        if (!data) return [];
        const presets: Preset[] = JSON.parse(data);
        return presets.sort((a, b) => (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt));
      }
    } catch (error) {
      console.error('[Storage] Error getting presets:', error);
      return [];
    }
  },

  async getPreset(id: string): Promise<Preset | null> {
    try {
      if (Platform.OS === 'web') {
        return await presetsStore.getItem<Preset>(id);
      } else {
        const allPresets = await this.getAllPresets();
        return allPresets.find(p => p.id === id) || null;
      }
    } catch (error) {
      console.error('[Storage] Error getting preset:', error);
      return null;
    }
  },

  async deletePreset(id: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await presetsStore.removeItem(id);
      } else {
        const allPresets = await this.getAllPresets();
        const filtered = allPresets.filter(p => p.id !== id);
        await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
        console.log('[Storage] Deleted preset:', id);
      }
    } catch (error) {
      console.error('[Storage] Error deleting preset:', error);
      throw error;
    }
  },

  async updatePresetLastUsed(id: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        const preset = await presetsStore.getItem<Preset>(id);
        if (preset) {
          preset.lastUsed = Date.now();
          await presetsStore.setItem(id, preset);
        }
      } else {
        const allPresets = await this.getAllPresets();
        const preset = allPresets.find(p => p.id === id);
        if (preset) {
          preset.lastUsed = Date.now();
          await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(allPresets));
        }
      }
    } catch (error) {
      console.error('[Storage] Error updating preset last used:', error);
    }
  },

  // Favorites Management
  async getFavorites(): Promise<string[]> {
    try {
      if (Platform.OS === 'web') {
        const favoritesStore = localforage.createInstance({
          name: 'mymix',
          storeName: 'favorites',
        });
        const favorites = await favoritesStore.getItem<string[]>('favorite_tracks');
        return favorites || [];
      } else {
        const data = await AsyncStorage.getItem('@mymix_favorites');
        return data ? JSON.parse(data) : [];
      }
    } catch (error) {
      console.error('[Storage] Error getting favorites:', error);
      return [];
    }
  },

  async saveFavorites(favorites: string[]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        const favoritesStore = localforage.createInstance({
          name: 'mymix',
          storeName: 'favorites',
        });
        await favoritesStore.setItem('favorite_tracks', favorites);
      } else {
        await AsyncStorage.setItem('@mymix_favorites', JSON.stringify(favorites));
      }
    } catch (error) {
      console.error('[Storage] Error saving favorites:', error);
    }
  },

  async addFavorite(trackId: string): Promise<void> {
    const favorites = await this.getFavorites();
    if (!favorites.includes(trackId)) {
      favorites.push(trackId);
      await this.saveFavorites(favorites);
    }
  },

  async removeFavorite(trackId: string): Promise<void> {
    const favorites = await this.getFavorites();
    const filtered = favorites.filter(id => id !== trackId);
    await this.saveFavorites(filtered);
  },

  async isFavorite(trackId: string): Promise<boolean> {
    const favorites = await this.getFavorites();
    return favorites.includes(trackId);
  },
};

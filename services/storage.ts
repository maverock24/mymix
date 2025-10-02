import localforage from 'localforage';

export interface AudioFile {
  id: string;
  name: string;
  data: Blob; // Audio file as Blob (much more efficient than Base64)
  type: string;
}

export interface AudioPair {
  id: string;
  name: string;
  backgroundMusic: AudioFile;
  audiobook: AudioFile;
  createdAt: number;
  savedPosition?: number; // Saved playback position in milliseconds for audiobook
}

// Initialize localforage
const audioPairStore = localforage.createInstance({
  name: 'mymix',
  storeName: 'audioPairs',
});

export const StorageService = {
  // Save an audio pair
  async saveAudioPair(pair: Omit<AudioPair, 'id' | 'createdAt'>): Promise<AudioPair> {
    const audioPair: AudioPair = {
      ...pair,
      id: `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };
    await audioPairStore.setItem(audioPair.id, audioPair);
    return audioPair;
  },

  // Get all audio pairs
  async getAllAudioPairs(): Promise<AudioPair[]> {
    const pairs: AudioPair[] = [];
    await audioPairStore.iterate((value: AudioPair) => {
      pairs.push(value);
    });
    return pairs.sort((a, b) => b.createdAt - a.createdAt);
  },

  // Get a specific audio pair by ID
  async getAudioPair(id: string): Promise<AudioPair | null> {
    return await audioPairStore.getItem<AudioPair>(id);
  },

  // Delete an audio pair
  async deleteAudioPair(id: string): Promise<void> {
    await audioPairStore.removeItem(id);
  },

  // Update an audio pair
  async updateAudioPair(id: string, updates: Partial<AudioPair>): Promise<AudioPair | null> {
    const existingPair = await audioPairStore.getItem<AudioPair>(id);
    if (!existingPair) return null;

    const updatedPair = { ...existingPair, ...updates, id };
    await audioPairStore.setItem(id, updatedPair);
    return updatedPair;
  },

  // Clear all audio pairs
  async clearAll(): Promise<void> {
    await audioPairStore.clear();
  },

  // Save playback position for an audio pair
  async savePosition(id: string, position: number): Promise<void> {
    const existingPair = await audioPairStore.getItem<AudioPair>(id);
    if (!existingPair) return;

    const updatedPair = { ...existingPair, savedPosition: position };
    await audioPairStore.setItem(id, updatedPair);
  },
};

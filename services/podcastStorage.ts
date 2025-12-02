import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface Podcast {
  id: string;
  title: string;
  artist: string;
  feedUrl: string;
  imageUrl?: string;
  category?: string; // For folder/category grouping
  autoDownload?: boolean;
  lastRefreshed?: number;
}

export interface Episode {
  id: string;
  podcastId: string;
  title: string;
  audioUrl: string;
  description?: string;
  duration?: number;
  pubDate?: string;
  chapters?: Chapter[];
  imageUrl?: string;
}

export interface Chapter {
  title: string;
  startTime: number; // in milliseconds
  endTime?: number;
  imageUrl?: string;
}

export interface EpisodeProgress {
  episodeId: string;
  podcastId: string;
  position: number; // in milliseconds
  duration: number; // in milliseconds
  lastPlayed: number; // timestamp
  completed: boolean;
}

export interface QueueItem {
  episode: Episode;
  podcast: Podcast;
  addedAt: number;
}

export interface DownloadedEpisode {
  episodeId: string;
  podcastId: string;
  localUri: string;
  downloadedAt: number;
  fileSize: number;
}

export interface PodcastSettings {
  sleepTimerMinutes: number | null;
  sleepTimerEndOfEpisode: boolean;
  autoRewindSeconds: number;
  defaultPlaybackSpeed: number;
  streamingOnCellular: boolean;
  autoCleanupDays: number;
}

export type SortOption = 'newest' | 'oldest' | 'duration_asc' | 'duration_desc';
export type FilterOption = 'all' | 'unplayed' | 'in_progress' | 'completed';

const PODCASTS_KEY = 'podcasts';
const EPISODES_KEY = 'podcast_episodes';
const PROGRESS_KEY = 'episode_progress';
const QUEUE_KEY = 'podcast_queue';
const DOWNLOADS_KEY = 'podcast_downloads';
const SETTINGS_KEY = 'podcast_settings';

const DEFAULT_SETTINGS: PodcastSettings = {
  sleepTimerMinutes: null,
  sleepTimerEndOfEpisode: false,
  autoRewindSeconds: 2,
  defaultPlaybackSpeed: 1.0,
  streamingOnCellular: true,
  autoCleanupDays: 7,
};

export class PodcastStorageService {
  // Podcasts
  static async getAllPodcasts(): Promise<Podcast[]> {
    try {
      const data = await AsyncStorage.getItem(PODCASTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading podcasts:', error);
      return [];
    }
  }

  static async savePodcasts(podcasts: Podcast[]): Promise<void> {
    try {
      await AsyncStorage.setItem(PODCASTS_KEY, JSON.stringify(podcasts));
    } catch (error) {
      console.error('Error saving podcasts:', error);
    }
  }

  static async addPodcast(podcast: Podcast): Promise<Podcast[]> {
    const podcasts = await this.getAllPodcasts();
    if (!podcasts.some(p => p.id === podcast.id)) {
      podcasts.push(podcast);
      await this.savePodcasts(podcasts);
    }
    return podcasts;
  }

  static async updatePodcast(podcast: Podcast): Promise<Podcast[]> {
    const podcasts = await this.getAllPodcasts();
    const index = podcasts.findIndex(p => p.id === podcast.id);
    if (index >= 0) {
      podcasts[index] = podcast;
      await this.savePodcasts(podcasts);
    }
    return podcasts;
  }

  static async removePodcast(podcastId: string): Promise<Podcast[]> {
    const podcasts = await this.getAllPodcasts();
    const updated = podcasts.filter(p => p.id !== podcastId);
    await this.savePodcasts(updated);

    // Also clean up episodes and progress for this podcast
    await this.removeEpisodesForPodcast(podcastId);
    await this.removeProgressForPodcast(podcastId);
    await this.removeDownloadsForPodcast(podcastId);

    return updated;
  }

  // Episodes
  static async getEpisodesForPodcast(podcastId: string): Promise<Episode[]> {
    try {
      const data = await AsyncStorage.getItem(`${EPISODES_KEY}_${podcastId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading episodes:', error);
      return [];
    }
  }

  static async saveEpisodesForPodcast(podcastId: string, episodes: Episode[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${EPISODES_KEY}_${podcastId}`,
        JSON.stringify(episodes)
      );
    } catch (error) {
      console.error('Error saving episodes:', error);
    }
  }

  static async removeEpisodesForPodcast(podcastId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${EPISODES_KEY}_${podcastId}`);
    } catch (error) {
      console.error('Error removing episodes:', error);
    }
  }

  // Episode Progress
  static async getEpisodeProgress(episodeId: string): Promise<EpisodeProgress | null> {
    try {
      const data = await AsyncStorage.getItem(`${PROGRESS_KEY}_${episodeId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading episode progress:', error);
      return null;
    }
  }

  static async saveEpisodeProgress(progress: EpisodeProgress): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${PROGRESS_KEY}_${progress.episodeId}`,
        JSON.stringify(progress)
      );
    } catch (error) {
      console.error('Error saving episode progress:', error);
    }
  }

  static async getAllProgress(): Promise<EpisodeProgress[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const progressKeys = keys.filter(key => key.startsWith(PROGRESS_KEY));
      const progressData = await AsyncStorage.multiGet(progressKeys);

      return progressData
        .map(([_, value]) => value ? JSON.parse(value) : null)
        .filter((item): item is EpisodeProgress => item !== null);
    } catch (error) {
      console.error('Error loading all progress:', error);
      return [];
    }
  }

  static async removeProgressForPodcast(podcastId: string): Promise<void> {
    try {
      const allProgress = await this.getAllProgress();
      const progressToRemove = allProgress.filter(p => p.podcastId === podcastId);

      await AsyncStorage.multiRemove(
        progressToRemove.map(p => `${PROGRESS_KEY}_${p.episodeId}`)
      );
    } catch (error) {
      console.error('Error removing progress:', error);
    }
  }

  static async clearEpisodeProgress(episodeId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${PROGRESS_KEY}_${episodeId}`);
    } catch (error) {
      console.error('Error clearing episode progress:', error);
    }
  }

  static async markEpisodeAsPlayed(episodeId: string, podcastId: string, duration: number): Promise<void> {
    await this.saveEpisodeProgress({
      episodeId,
      podcastId,
      position: 0,
      duration,
      lastPlayed: Date.now(),
      completed: true,
    });
  }

  static async markEpisodeAsUnplayed(episodeId: string): Promise<void> {
    await this.clearEpisodeProgress(episodeId);
  }

  // Get progress for all episodes of a podcast
  static async getProgressForPodcast(podcastId: string): Promise<Map<string, EpisodeProgress>> {
    const allProgress = await this.getAllProgress();
    const podcastProgress = allProgress.filter(p => p.podcastId === podcastId);

    const progressMap = new Map<string, EpisodeProgress>();
    podcastProgress.forEach(p => {
      progressMap.set(p.episodeId, p);
    });

    return progressMap;
  }

  // Queue Management
  static async getQueue(): Promise<QueueItem[]> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading queue:', error);
      return [];
    }
  }

  static async saveQueue(queue: QueueItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  }

  static async addToQueue(episode: Episode, podcast: Podcast): Promise<QueueItem[]> {
    const queue = await this.getQueue();
    // Don't add duplicates
    if (!queue.some(item => item.episode.id === episode.id)) {
      queue.push({
        episode,
        podcast,
        addedAt: Date.now(),
      });
      await this.saveQueue(queue);
    }
    return queue;
  }

  static async removeFromQueue(episodeId: string): Promise<QueueItem[]> {
    const queue = await this.getQueue();
    const updated = queue.filter(item => item.episode.id !== episodeId);
    await this.saveQueue(updated);
    return updated;
  }

  static async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }

  static async moveInQueue(fromIndex: number, toIndex: number): Promise<QueueItem[]> {
    const queue = await this.getQueue();
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
      return queue;
    }
    const [item] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, item);
    await this.saveQueue(queue);
    return queue;
  }

  static async getNextInQueue(): Promise<QueueItem | null> {
    const queue = await this.getQueue();
    return queue.length > 0 ? queue[0] : null;
  }

  static async popFromQueue(): Promise<QueueItem | null> {
    const queue = await this.getQueue();
    if (queue.length === 0) return null;
    const [first, ...rest] = queue;
    await this.saveQueue(rest);
    return first;
  }

  // Downloads (native only)
  static async getDownloads(): Promise<DownloadedEpisode[]> {
    try {
      const data = await AsyncStorage.getItem(DOWNLOADS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading downloads:', error);
      return [];
    }
  }

  static async saveDownloads(downloads: DownloadedEpisode[]): Promise<void> {
    try {
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
    } catch (error) {
      console.error('Error saving downloads:', error);
    }
  }

  static async downloadEpisode(
    episode: Episode,
    podcastId: string,
    onProgress?: (progress: number) => void
  ): Promise<DownloadedEpisode | null> {
    if (Platform.OS === 'web') {
      console.log('Downloads not supported on web');
      return null;
    }

    try {
      const downloads = await this.getDownloads();

      // Check if already downloaded
      const existing = downloads.find(d => d.episodeId === episode.id);
      if (existing) {
        return existing;
      }

      const fileName = `podcast_${podcastId}_${episode.id}.mp3`;
      const localUri = `${FileSystem.documentDirectory}podcasts/${fileName}`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}podcasts`);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}podcasts`, { intermediates: true });
      }

      // Download the file
      const downloadResumable = FileSystem.createDownloadResumable(
        episode.audioUrl,
        localUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(progress);
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result) {
        throw new Error('Download failed');
      }

      const fileInfo = await FileSystem.getInfoAsync(result.uri);

      const downloadedEpisode: DownloadedEpisode = {
        episodeId: episode.id,
        podcastId,
        localUri: result.uri,
        downloadedAt: Date.now(),
        fileSize: (fileInfo as any).size || 0,
      };

      downloads.push(downloadedEpisode);
      await this.saveDownloads(downloads);

      return downloadedEpisode;
    } catch (error) {
      console.error('Error downloading episode:', error);
      return null;
    }
  }

  static async getDownloadedEpisode(episodeId: string): Promise<DownloadedEpisode | null> {
    const downloads = await this.getDownloads();
    return downloads.find(d => d.episodeId === episodeId) || null;
  }

  static async deleteDownload(episodeId: string): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      const downloads = await this.getDownloads();
      const download = downloads.find(d => d.episodeId === episodeId);

      if (download) {
        await FileSystem.deleteAsync(download.localUri, { idempotent: true });
        const updated = downloads.filter(d => d.episodeId !== episodeId);
        await this.saveDownloads(updated);
      }
    } catch (error) {
      console.error('Error deleting download:', error);
    }
  }

  static async removeDownloadsForPodcast(podcastId: string): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      const downloads = await this.getDownloads();
      const toRemove = downloads.filter(d => d.podcastId === podcastId);

      for (const download of toRemove) {
        await FileSystem.deleteAsync(download.localUri, { idempotent: true });
      }

      const updated = downloads.filter(d => d.podcastId !== podcastId);
      await this.saveDownloads(updated);
    } catch (error) {
      console.error('Error removing downloads:', error);
    }
  }

  static async cleanupOldDownloads(daysOld: number): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      const downloads = await this.getDownloads();
      const allProgress = await this.getAllProgress();
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      const toRemove: DownloadedEpisode[] = [];

      for (const download of downloads) {
        const progress = allProgress.find(p => p.episodeId === download.episodeId);
        // Remove if completed and downloaded more than X days ago
        if (progress?.completed && download.downloadedAt < cutoffTime) {
          toRemove.push(download);
        }
      }

      for (const download of toRemove) {
        await FileSystem.deleteAsync(download.localUri, { idempotent: true });
      }

      const updated = downloads.filter(d => !toRemove.includes(d));
      await this.saveDownloads(updated);
    } catch (error) {
      console.error('Error cleaning up downloads:', error);
    }
  }

  // Settings
  static async getSettings(): Promise<PodcastSettings> {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error loading settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  static async saveSettings(settings: Partial<PodcastSettings>): Promise<PodcastSettings> {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...settings };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error saving settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  // Helper: Filter and sort episodes
  static filterAndSortEpisodes(
    episodes: Episode[],
    progressMap: Map<string, EpisodeProgress>,
    filter: FilterOption,
    sort: SortOption
  ): Episode[] {
    let filtered = [...episodes];

    // Apply filter
    switch (filter) {
      case 'unplayed':
        filtered = filtered.filter(ep => {
          const progress = progressMap.get(ep.id);
          return !progress || (!progress.completed && progress.position === 0);
        });
        break;
      case 'in_progress':
        filtered = filtered.filter(ep => {
          const progress = progressMap.get(ep.id);
          return progress && !progress.completed && progress.position > 0;
        });
        break;
      case 'completed':
        filtered = filtered.filter(ep => {
          const progress = progressMap.get(ep.id);
          return progress?.completed === true;
        });
        break;
    }

    // Apply sort
    switch (sort) {
      case 'newest':
        filtered.sort((a, b) => {
          const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
          const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'oldest':
        filtered.sort((a, b) => {
          const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
          const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case 'duration_asc':
        filtered.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        break;
      case 'duration_desc':
        filtered.sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
    }

    return filtered;
  }
}

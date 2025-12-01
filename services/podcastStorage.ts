import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Podcast {
  id: string;
  title: string;
  artist: string;
  feedUrl: string;
  imageUrl?: string;
}

export interface Episode {
  id: string;
  podcastId: string;
  title: string;
  audioUrl: string;
  description?: string;
  duration?: number;
  pubDate?: string;
}

export interface EpisodeProgress {
  episodeId: string;
  podcastId: string;
  position: number; // in milliseconds
  duration: number; // in milliseconds
  lastPlayed: number; // timestamp
  completed: boolean;
}

const PODCASTS_KEY = 'podcasts';
const EPISODES_KEY = 'podcast_episodes';
const PROGRESS_KEY = 'episode_progress';

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

  static async removePodcast(podcastId: string): Promise<Podcast[]> {
    const podcasts = await this.getAllPodcasts();
    const updated = podcasts.filter(p => p.id !== podcastId);
    await this.savePodcasts(updated);

    // Also clean up episodes and progress for this podcast
    await this.removeEpisodesForPodcast(podcastId);
    await this.removeProgressForPodcast(podcastId);

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
}

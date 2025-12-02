import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import { playbackCoordinator } from '../services/playbackCoordinator';
import {
  PodcastStorageService,
  Podcast,
  Episode,
  EpisodeProgress,
  QueueItem,
  DownloadedEpisode,
  PodcastSettings,
  SortOption,
  FilterOption,
  Chapter,
} from '../services/podcastStorage';
import { SleepTimer, SleepTimerDuration, SleepTimerState } from '../services/sleepTimer';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const PodcastScreen: React.FC = () => {
  // Podcast/Episode state
  const [savedPodcasts, setSavedPodcasts] = useState<Podcast[]>([]);
  const [isLoadingPodcasts, setIsLoadingPodcasts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Podcast[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [filteredEpisodes, setFilteredEpisodes] = useState<Episode[]>([]);
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, EpisodeProgress>>(new Map());
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [addingPodcastId, setAddingPodcastId] = useState<string | null>(null);

  // Playback state
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showQueueModal, setShowQueueModal] = useState(false);

  // Filter/Sort state
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Sleep timer state
  const [sleepTimerState, setSleepTimerState] = useState<SleepTimerState>({
    isActive: false,
    remainingSeconds: 0,
    totalSeconds: 0,
  });
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [sleepAtEndOfEpisode, setSleepAtEndOfEpisode] = useState(false);

  // Download state
  const [downloads, setDownloads] = useState<DownloadedEpisode[]>([]);
  const [downloadingEpisodes, setDownloadingEpisodes] = useState<Map<string, number>>(new Map());

  // Settings state
  const [settings, setSettings] = useState<PodcastSettings | null>(null);

  // Chapter state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [showChaptersModal, setShowChaptersModal] = useState(false);

  // Episode details modal
  const [showEpisodeDetails, setShowEpisodeDetails] = useState(false);
  const [detailEpisode, setDetailEpisode] = useState<Episode | null>(null);

  // Speed picker modal
  const [showSpeedModal, setShowSpeedModal] = useState(false);

  // Refs
  const progressSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPauseTime = useRef<number | null>(null);
  const autoRewindApplied = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const sleepTimer = SleepTimer.getInstance();

  // Keep sound ref updated
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Register with PlaybackCoordinator
  useEffect(() => {
    const id = 'podcast-player';
    return playbackCoordinator.register(id, 'podcast', async () => {
      if (soundRef.current) {
        console.log('[Podcast] Pausing due to coordinator request');
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    });
  }, []);

  // Subscribe to global sleep timer
  useEffect(() => {
    const unsubscribe = sleepTimer.addListener((state) => {
      setSleepTimerState(state);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Initialize
  useEffect(() => {
    loadSavedPodcasts();
    loadQueue();
    loadDownloads();
    loadSettings();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
    };
  }, []);

  // Apply filter/sort when episodes or options change
  useEffect(() => {
    if (episodes.length > 0) {
      const filtered = PodcastStorageService.filterAndSortEpisodes(
        episodes,
        episodeProgress,
        filterOption,
        sortOption
      );
      setFilteredEpisodes(filtered);
    }
  }, [episodes, episodeProgress, filterOption, sortOption]);

  // Update current chapter based on position
  useEffect(() => {
    if (chapters.length > 0 && position > 0) {
      const chapter = chapters.find((ch, index) => {
        const nextChapter = chapters[index + 1];
        return position >= ch.startTime && (!nextChapter || position < nextChapter.startTime);
      });
      if (chapter && chapter !== currentChapter) {
        setCurrentChapter(chapter);
      }
    }
  }, [position, chapters]);



  const loadSavedPodcasts = async () => {
    setIsLoadingPodcasts(true);
    try {
      const podcasts = await PodcastStorageService.getAllPodcasts();
      setSavedPodcasts(podcasts);
    } catch (error) {
      console.error('Error loading podcasts:', error);
    } finally {
      setIsLoadingPodcasts(false);
    }
  };

  const loadQueue = async () => {
    const q = await PodcastStorageService.getQueue();
    setQueue(q);
  };

  const loadDownloads = async () => {
    const d = await PodcastStorageService.getDownloads();
    setDownloads(d);
  };

  const loadSettings = async () => {
    const s = await PodcastStorageService.getSettings();
    setSettings(s);
    setPlaybackSpeed(s.defaultPlaybackSpeed);
  };

  const searchPodcasts = async () => {
    if (!searchQuery.trim()) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          searchQuery
        )}&entity=podcast&limit=20`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const results: Podcast[] = (data.results || [])
        .filter((item: any) => {
          return item.collectionId &&
                 item.collectionName &&
                 item.feedUrl &&
                 String(item.feedUrl).trim() !== '';
        })
        .map((item: any) => ({
          id: String(item.collectionId),
          title: String(item.collectionName) || 'Unknown Podcast',
          artist: String(item.artistName) || 'Unknown Artist',
          feedUrl: String(item.feedUrl),
          imageUrl: item.artworkUrl600 || item.artworkUrl100 || '',
        }));

      setSearchResults(results);
    } catch (error) {
      console.error('Error searching podcasts:', error);
      setSearchResults([]);
          if ((Platform.OS as string) !== 'web') {
            Alert.alert('Error', 'Failed to search podcasts. Please try again.');
          }    } finally {
      setIsSearching(false);
    }
  };

  const handleAddPodcast = async (podcast: Podcast) => {
    if (savedPodcasts.some((p) => p.id === podcast.id)) {
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Info', 'This podcast is already in your library');
      }
      return;
    }

    setAddingPodcastId(podcast.id);
    try {
      const updated = await PodcastStorageService.addPodcast(podcast);
      setSavedPodcasts(updated);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);

      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Success', `Added "${podcast.title}" to your library`);
      }
    } catch (error) {
      console.error('Error adding podcast:', error);
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Error', 'Failed to add podcast');
      }
    } finally {
      setAddingPodcastId(null);
    }
  };

  const handleRemovePodcast = (id: string, title: string) => {
    const doRemove = async () => {
      const updated = await PodcastStorageService.removePodcast(id);
      setSavedPodcasts(updated);
      if (selectedPodcast?.id === id) {
        setSelectedPodcast(null);
        setEpisodes([]);
        if (sound) {
          await sound.unloadAsync();
          setSound(null);
          setCurrentEpisode(null);
        }
      }
    };

    if ((Platform.OS as string) !== 'web') {
      Alert.alert('Remove Podcast', `Remove "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    } else {
      if (confirm(`Remove podcast "${title}"?`)) {
        doRemove();
      }
    }
  };

  const handleSelectPodcast = async (podcast: Podcast) => {
    setSelectedPodcast(podcast);
    setIsLoadingEpisodes(true);

    try {
      let cachedEpisodes = await PodcastStorageService.getEpisodesForPodcast(podcast.id);

      if (cachedEpisodes.length > 0) {
        setEpisodes(cachedEpisodes);
        const progress = await PodcastStorageService.getProgressForPodcast(podcast.id);
        setEpisodeProgress(progress);
        setIsLoadingEpisodes(false);
      }

      const response = await fetch(podcast.feedUrl);
      const rssText = await response.text();
      const freshEpisodes = parseRSSFeed(rssText, podcast.id);

      await PodcastStorageService.saveEpisodesForPodcast(podcast.id, freshEpisodes);
      setEpisodes(freshEpisodes);

      const progress = await PodcastStorageService.getProgressForPodcast(podcast.id);
      setEpisodeProgress(progress);
    } catch (error) {
      console.error('Error loading episodes:', error);
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Error', 'Failed to load episodes');
      }
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const parseRSSFeed = (rssText: string, podcastId: string): Episode[] => {
    try {
      const itemRegex = /<item>(.*?)<\/item>/gs;
      const items = rssText.match(itemRegex) || [];

      return items
        .slice(0, 50)
        .map((item, index) => {
          const titleMatch = item.match(/<title>(.*?)<\/title>/s);
          const descMatch = item.match(/<description>(.*?)<\/description>/s);
          const contentMatch = item.match(/<content:encoded>(.*?)<\/content:encoded>/s);
          const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*>/);
          const durationMatch = item.match(/<itunes:duration>(.*?)<\/itunes:duration>/s);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/s);
          const imageMatch = item.match(/<itunes:image[^>]*href="([^"]*)"[^>]*>/);
          const chaptersMatch = item.match(/<psc:chapters>(.*?)<\/psc:chapters>/s);

          const title = titleMatch
            ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').trim()
            : `Episode ${index + 1}`;
          const description = (contentMatch || descMatch)
            ? (contentMatch || descMatch)![1]
                .replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1')
                .replace(/<[^>]*>/g, '')
                .trim()
            : '';
          const audioUrl = enclosureMatch ? enclosureMatch[1] : '';
          const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toLocaleDateString() : '';
          const imageUrl = imageMatch ? imageMatch[1] : undefined;

          // Parse duration
          let duration: number | undefined;
          if (durationMatch) {
            const durationStr = durationMatch[1];
            if (durationStr.includes(':')) {
              const parts = durationStr.split(':').map(Number);
              if (parts.length === 3) {
                duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
              } else if (parts.length === 2) {
                duration = (parts[0] * 60 + parts[1]) * 1000;
              }
            } else {
              duration = parseInt(durationStr) * 1000;
            }
          }

          // Parse chapters (Podcast Standard Chapter format)
          let chapters: Chapter[] | undefined;
          if (chaptersMatch) {
            const chapterRegex = /<psc:chapter[^>]*start="([^"]*)"[^>]*title="([^"]*)"[^>]*>/g;
            let match;
            chapters = [];
            while ((match = chapterRegex.exec(chaptersMatch[1])) !== null) {
              const [, startStr, chapterTitle] = match;
              const timeParts = startStr.split(':').map(Number);
              let startTime = 0;
              if (timeParts.length === 3) {
                startTime = (timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]) * 1000;
              } else if (timeParts.length === 2) {
                startTime = (timeParts[0] * 60 + timeParts[1]) * 1000;
              }
              chapters.push({ title: chapterTitle, startTime });
            }
          }

          const episodeId = `${podcastId}-episode-${index}`;

          return {
            id: episodeId,
            podcastId,
            title,
            description,
            audioUrl,
            pubDate,
            duration,
            imageUrl,
            chapters,
          };
        })
        .filter((ep) => ep.audioUrl);
    } catch (error) {
      console.error('Error parsing RSS:', error);
      return [];
    }
  };

  const handlePlayEpisode = async (episode: Episode, podcast?: Podcast) => {
    try {
      console.log('[Podcast] Playing episode:', episode.title);
      setIsBuffering(true);

      // Stop current playback
      if (sound) {
        await saveCurrentProgress();
        await sound.unloadAsync();
        setSound(null);
      }

      // Check for downloaded version
      const downloaded = await PodcastStorageService.getDownloadedEpisode(episode.id);
      const audioUri = downloaded?.localUri || episode.audioUrl;

      // Check saved progress
      const savedProgress = await PodcastStorageService.getEpisodeProgress(episode.id);
      let startPosition = savedProgress && !savedProgress.completed ? savedProgress.position : 0;

      // Apply auto-rewind if resuming after a pause
      if (startPosition > 0 && settings?.autoRewindSeconds && settings.autoRewindSeconds > 0) {
        startPosition = Math.max(0, startPosition - (settings.autoRewindSeconds * 1000));
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 2,
        interruptionModeIOS: 2,
      });

      // Create and play sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay: false, // Don't auto-play yet
          positionMillis: startPosition,
          rate: playbackSpeed,
          shouldCorrectPitch: true,
        }
      );

      playbackCoordinator.notifyPlay('podcast');
      await newSound.playAsync();

      setSound(newSound);
      setCurrentEpisode(episode);
      setCurrentPodcast(podcast || selectedPodcast);
      setIsPlaying(true);
      setIsBuffering(false);
      setChapters(episode.chapters || []);
      setCurrentChapter(null);
      lastPauseTime.current = null;
      autoRewindApplied.current = false;

      newSound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      startProgressSaving();

      // Remove from queue if it was queued
      await PodcastStorageService.removeFromQueue(episode.id);
      loadQueue();
    } catch (error) {
      console.error('[Podcast] Error playing episode:', error);
      setIsBuffering(false);
      const errorMsg = (error as Error).message || String(error);
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Playback Error', `Failed to play episode: ${errorMsg}`);
      }
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsBuffering(true);
      return;
    }

    setIsBuffering(status.isBuffering || false);
    setPosition(status.positionMillis || 0);
    setDuration(status.durationMillis || 0);
    setIsPlaying(status.isPlaying);

    if (status.didJustFinish) {
      handleEpisodeFinished();
    }
  };

  const handleEpisodeFinished = async () => {
    if (!currentEpisode) return;

    // Check sleep at end of episode
    if (sleepAtEndOfEpisode) {
      cancelSleepTimer();
      if (sound) {
        await sound.pauseAsync();
      }
      setIsPlaying(false);
      return;
    }

    // Mark as completed
    await PodcastStorageService.saveEpisodeProgress({
      episodeId: currentEpisode.id,
      podcastId: currentEpisode.podcastId,
      position: 0,
      duration: duration,
      lastPlayed: Date.now(),
      completed: true,
    });

    // Update local progress
    const updatedProgress = new Map(episodeProgress);
    updatedProgress.set(currentEpisode.id, {
      episodeId: currentEpisode.id,
      podcastId: currentEpisode.podcastId,
      position: 0,
      duration: duration,
      lastPlayed: Date.now(),
      completed: true,
    });
    setEpisodeProgress(updatedProgress);

    // Play next in queue
    const nextItem = await PodcastStorageService.popFromQueue();
    if (nextItem) {
      loadQueue();
      handlePlayEpisode(nextItem.episode, nextItem.podcast);
    } else {
      setIsPlaying(false);
    }
  };

  const saveCurrentProgress = async () => {
    if (!currentEpisode || !sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        const currentPosition = status.positionMillis || 0;
        const currentDuration = status.durationMillis || 0;

        if (currentPosition < 5000) return;

        const completed = currentDuration - currentPosition < 30000;

        await PodcastStorageService.saveEpisodeProgress({
          episodeId: currentEpisode.id,
          podcastId: currentEpisode.podcastId,
          position: completed ? 0 : currentPosition,
          duration: currentDuration,
          lastPlayed: Date.now(),
          completed,
        });
      }
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const startProgressSaving = () => {
    if (progressSaveInterval.current) {
      clearInterval(progressSaveInterval.current);
    }
    progressSaveInterval.current = setInterval(() => {
      saveCurrentProgress();
    }, 10000);
  };

  const handlePauseResume = async () => {
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
        await saveCurrentProgress();
        lastPauseTime.current = Date.now();
      } else {
        // Apply auto-rewind if paused for more than 5 minutes
        if (lastPauseTime.current && settings?.autoRewindSeconds) {
          const pauseDuration = Date.now() - lastPauseTime.current;
          if (pauseDuration > 5 * 60 * 1000 && !autoRewindApplied.current) {
            const newPosition = Math.max(0, position - (settings.autoRewindSeconds * 1000));
            await sound.setPositionAsync(newPosition);
            autoRewindApplied.current = true;
          }
        }
        playbackCoordinator.notifyPlay('podcast');
        await sound.playAsync();
        lastPauseTime.current = null;
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  const handleSeek = async (value: number) => {
    if (!sound) return;
    try {
      await sound.setPositionAsync(value);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const handleSkip = async (seconds: number) => {
    if (!sound) return;
    try {
      const newPosition = Math.max(0, Math.min(duration, position + seconds * 1000));
      await sound.setPositionAsync(newPosition);
    } catch (error) {
      console.error('Error skipping:', error);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    if (sound) {
      try {
        await sound.setRateAsync(speed, true);
      } catch (error) {
        console.error('Error changing speed:', error);
      }
    }
    setShowSpeedModal(false);
  };

  const handleChapterSelect = async (chapter: Chapter) => {
    if (sound) {
      await sound.setPositionAsync(chapter.startTime);
    }
    setShowChaptersModal(false);
  };

  // Queue management
  const handleAddToQueue = async (episode: Episode) => {
    if (!selectedPodcast) return;
    const updated = await PodcastStorageService.addToQueue(episode, selectedPodcast);
    setQueue(updated);
    if ((Platform.OS as string) !== 'web') {
      Alert.alert('Added to Queue', `"${episode.title}" added to Up Next`);
    }
  };

  const handleRemoveFromQueue = async (episodeId: string) => {
    const updated = await PodcastStorageService.removeFromQueue(episodeId);
    setQueue(updated);
  };

  const handlePlayNext = async (episode: Episode) => {
    if (!selectedPodcast) return;
    // Add to front of queue
    const currentQueue = await PodcastStorageService.getQueue();
    const newItem: QueueItem = {
      episode,
      podcast: selectedPodcast,
      addedAt: Date.now(),
    };
    await PodcastStorageService.saveQueue([newItem, ...currentQueue.filter(q => q.episode.id !== episode.id)]);
    loadQueue();
    if ((Platform.OS as string) !== 'web') {
      Alert.alert('Play Next', `"${episode.title}" will play next`);
    }
  };

  // New function to play the next episode from the queue
  const playNextEpisodeFromQueue = useCallback(async () => {
    const nextItem = await PodcastStorageService.popFromQueue();
    if (nextItem) {
      loadQueue(); // Update queue display
      handlePlayEpisode(nextItem.episode, nextItem.podcast);
    } else {
      if ((Platform.OS as string) !== 'web') {
        Alert.alert('Queue Empty', 'No more episodes in queue.');
      } else {
        alert('Queue Empty: No more episodes to play.'); // Web alert has no title
      }
      setIsPlaying(false);
      if (sound) await sound.unloadAsync(); // Stop current playback if nothing in queue
    }
  }, [loadQueue, handlePlayEpisode, sound, setIsPlaying]); // Added setIsPlaying to deps.



  // Sleep timer
  const handleSetSleepTimer = (minutes: number | null, atEndOfEpisode: boolean = false) => {
    if (minutes === null && !atEndOfEpisode) {
      cancelSleepTimer();
    } else if (atEndOfEpisode) {
      setSleepAtEndOfEpisode(true);
      // If enabling "end of episode", stop the timed timer
      sleepTimer.stop();
    } else if (minutes) {
      // Start shared timer
      sleepTimer.start(minutes as SleepTimerDuration);
      setSleepAtEndOfEpisode(false);
    }
    setShowSleepTimerModal(false);
  };

  const cancelSleepTimer = () => {
    sleepTimer.stop();
    setSleepAtEndOfEpisode(false);
  };

  // Downloads
  const handleDownloadEpisode = async (episode: Episode) => {
    if (Platform.OS === 'web') {
      Alert.alert('Info', 'Downloads are not available on web');
      return;
    }

    const progress = new Map(downloadingEpisodes);
    progress.set(episode.id, 0);
    setDownloadingEpisodes(progress);

    const result = await PodcastStorageService.downloadEpisode(
      episode,
      episode.podcastId,
      (p) => {
        const updated = new Map(downloadingEpisodes);
        updated.set(episode.id, p);
        setDownloadingEpisodes(updated);
      }
    );

    progress.delete(episode.id);
    setDownloadingEpisodes(new Map(progress));

    if (result) {
      loadDownloads();
    }
  };

  const handleDeleteDownload = async (episodeId: string) => {
    await PodcastStorageService.deleteDownload(episodeId);
    loadDownloads();
  };

  // Mark played/unplayed
  const handleMarkAsPlayed = async (episode: Episode) => {
    await PodcastStorageService.markEpisodeAsPlayed(
      episode.id,
      episode.podcastId,
      episode.duration || 0
    );
    const progress = await PodcastStorageService.getProgressForPodcast(episode.podcastId);
    setEpisodeProgress(progress);
  };

  const handleMarkAsUnplayed = async (episode: Episode) => {
    await PodcastStorageService.markEpisodeAsUnplayed(episode.id);
    const progress = await PodcastStorageService.getProgressForPodcast(episode.podcastId);
    setEpisodeProgress(progress);
  };

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (episodeId: string): number => {
    const progress = episodeProgress.get(episodeId);
    if (!progress || progress.completed) return 0;
    if (progress.duration === 0) return 0;
    return (progress.position / progress.duration) * 100;
  };

  const isDownloaded = (episodeId: string): boolean => {
    return downloads.some(d => d.episodeId === episodeId);
  };

  const isDownloading = (episodeId: string): boolean => {
    return downloadingEpisodes.has(episodeId);
  };

  const getDownloadProgress = (episodeId: string): number => {
    return downloadingEpisodes.get(episodeId) || 0;
  };

  // Render episode action menu
  const showEpisodeActions = (episode: Episode) => {
    const progress = episodeProgress.get(episode.id);
    const isCompleted = progress?.completed || false;
    const downloaded = isDownloaded(episode.id);

    if (Platform.OS === 'web') {
      setDetailEpisode(episode);
      setShowEpisodeDetails(true);
      return;
    }

    const actions: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: 'Play', onPress: () => handlePlayEpisode(episode) },
      { text: 'Add to Queue', onPress: () => handleAddToQueue(episode) },
      { text: 'Play Next', onPress: () => handlePlayNext(episode) },
    ];

    if (isCompleted) {
      actions.push({ text: 'Mark as Unplayed', onPress: () => handleMarkAsUnplayed(episode) });
    } else {
      actions.push({ text: 'Mark as Played', onPress: () => handleMarkAsPlayed(episode) });
    }

    if ((Platform.OS as string) !== 'web') {
      if (downloaded) {
        actions.push({ text: 'Remove Download', onPress: () => handleDeleteDownload(episode.id), style: 'destructive' });
      } else {
        actions.push({ text: 'Download', onPress: () => handleDownloadEpisode(episode) });
      }
    }

    actions.push({ text: 'Cancel', onPress: () => {}, style: 'cancel' });

    Alert.alert(episode.title, undefined, actions);
  };

  // Episode list view
  if (selectedPodcast) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setSelectedPodcast(null);
              setEpisodes([]);
              setFilteredEpisodes([]);
              setEpisodeProgress(new Map());
              if (sound && currentPodcast?.id === selectedPodcast.id) {
                // Keep playing if navigating away but same podcast
              }
            }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.podcastHeader}>
            {selectedPodcast.imageUrl && (
              <Image
                source={{ uri: selectedPodcast.imageUrl }}
                style={styles.podcastHeaderImage}
              />
            )}
            <View style={styles.podcastHeaderInfo}>
              <Text style={styles.podcastHeaderTitle} numberOfLines={2}>
                {selectedPodcast.title}
              </Text>
              <Text style={styles.podcastHeaderArtist} numberOfLines={1}>
                {selectedPodcast.artist}
              </Text>
            </View>
          </View>
        </View>

        {/* Filter/Sort bar */}
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Text style={styles.filterButtonText}>
              {filterOption === 'all' ? 'All' :
               filterOption === 'unplayed' ? 'Unplayed' :
               filterOption === 'in_progress' ? 'In Progress' : 'Completed'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => {
              const options: SortOption[] = ['newest', 'oldest', 'duration_asc', 'duration_desc'];
              const currentIndex = options.indexOf(sortOption);
              setSortOption(options[(currentIndex + 1) % options.length]);
            }}
          >
            <Text style={styles.filterButtonText}>
              {sortOption === 'newest' ? '↓ Newest' :
               sortOption === 'oldest' ? '↑ Oldest' :
               sortOption === 'duration_asc' ? '↓ Short' : '↑ Long'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.queueButton}
            onPress={() => setShowQueueModal(true)}
          >
            <Text style={styles.queueButtonText}>Queue ({queue.length})</Text>
          </TouchableOpacity>
        </View>

        {isLoadingEpisodes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading episodes...</Text>
          </View>
        ) : filteredEpisodes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {filterOption === 'all' ? 'No episodes available' : `No ${filterOption.replace('_', ' ')} episodes`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredEpisodes}
            keyExtractor={(item) => item.id}
            style={styles.episodesList}
            contentContainerStyle={styles.episodesListContent}
            renderItem={({ item }) => {
              const progress = episodeProgress.get(item.id);
              const isCompleted = progress?.completed || false;
              const downloaded = isDownloaded(item.id);
              const isCurrent = currentEpisode?.id === item.id;

              return (
                <TouchableOpacity
                  style={[
                    styles.episodeItem,
                    isCompleted && styles.episodeItemPlayed,
                    isCurrent && styles.episodeItemActive,
                  ]}
                  onPress={() => {
                    if (isCurrent) {
                        handlePauseResume();
                    } else {
                        handlePlayEpisode(item);
                    }
                  }}
                  onLongPress={() => showEpisodeActions(item)}
                >
                  <View style={styles.episodeInfo}>
                    <View style={styles.episodeTitleRow}>
                      <Text style={[styles.episodeTitle, isCompleted && styles.episodeTitleCompleted]}>
                        {item.title}
                      </Text>
                      <View style={styles.episodeBadges}>
                        {downloaded && (
                          <TouchableOpacity 
                            onPress={() => {
                                // Prompt before deleting? Or just delete. User asked for interactive icons.
                                // Let's just delete or toggle. Maybe long press to delete?
                                // But "interactive" implies action.
                                // Since tapping the row handles play, this specific icon can handle download mgmt.
                                // Let's stick to the request: "icons... should be interactiveable".
                                // For safety, maybe alert.
                                Alert.alert('Delete Download?', `Delete "${item.title}" from device?`, [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => handleDeleteDownload(item.id) }
                                ]);
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={styles.downloadedBadge}>↓</Text>
                          </TouchableOpacity>
                        )}
                        {isCompleted && (
                          <TouchableOpacity
                            onPress={() => handleMarkAsUnplayed(item)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={styles.completedBadge}>✓</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View>
                      {item.pubDate && (
                        <Text style={styles.episodeDate}>{item.pubDate}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.episodeActions}>
                    {isCurrent ? (
                      <TouchableOpacity 
                        onPress={handlePauseResume}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.playingIndicator}>
                            {isBuffering ? '⏳' : isPlaying ? '▶' : '⏸'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.addToQueueButton}
                        onPress={() => handleAddToQueue(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.addToQueueButtonText}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Player */}
        {currentEpisode && (
          <View style={styles.player}>
            <View style={styles.playerContent}>
              {/* Chapter indicator */}
              {currentChapter && (
                <TouchableOpacity
                  style={styles.chapterIndicator}
                  onPress={() => setShowChaptersModal(true)}
                >
                  <Text style={styles.chapterIndicatorText} numberOfLines={1}>
                    📑 {currentChapter.title}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.playerInfo}>
                <Text style={styles.playerTitle} numberOfLines={1}>
                  {currentEpisode.title}
                </Text>
                <View style={styles.playerTimeContainer}>
                  <Text style={styles.playerTime}>{formatTime(position)}</Text>
                  <Text style={styles.playerTime}>{formatTime(duration)}</Text>
                </View>
              </View>

              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration || 1}
                value={position}
                onSlidingComplete={handleSeek}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />

              <View style={styles.playerControls}>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={() => handleSkip(-15)}
                >
                  <Text style={styles.skipButtonText}>-15s</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playButton}
                  onPress={handlePauseResume}
                  disabled={isBuffering}
                >
                  <Text style={styles.playButtonText}>
                    {isBuffering ? '⏳' : isPlaying ? '⏸' : '▶'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={() => handleSkip(30)}
                >
                  <Text style={styles.skipButtonText}>+30s</Text>
                </TouchableOpacity>
              </View>

              {/* Extra controls row */}
              <View style={styles.extraControls}>
                <TouchableOpacity
                  style={styles.extraButton}
                  onPress={() => setShowSpeedModal(true)}
                >
                  <Text style={styles.extraButtonText}>{playbackSpeed}x</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.extraButton}
                  onPress={() => setShowSleepTimerModal(true)}
                >
                  <Text style={styles.extraButtonText}>
                    {sleepTimerState.isActive ? `⏰ ${sleepTimer.formatTime(sleepTimerState.remainingSeconds)}` :
                     sleepAtEndOfEpisode ? '⏰ End' : '⏰'}
                  </Text>
                </TouchableOpacity>

                {chapters.length > 0 && (
                  <TouchableOpacity
                    style={styles.extraButton}
                    onPress={() => setShowChaptersModal(true)}
                  >
                    <Text style={styles.extraButtonText}>📑</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.extraButton}
                  onPress={playNextEpisodeFromQueue}
                >
                  <Text style={styles.extraButtonText}>⏭</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Filter Modal */}
        <Modal
          visible={showFilterModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFilterModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowFilterModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Filter Episodes</Text>
              {(['all', 'unplayed', 'in_progress', 'completed'] as FilterOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.modalOption, filterOption === option && styles.modalOptionActive]}
                  onPress={() => {
                    setFilterOption(option);
                    setShowFilterModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, filterOption === option && styles.modalOptionTextActive]}>
                    {option === 'all' ? 'All Episodes' :
                     option === 'unplayed' ? 'Unplayed' :
                     option === 'in_progress' ? 'In Progress' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Speed Modal */}
        <Modal
          visible={showSpeedModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSpeedModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowSpeedModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Playback Speed</Text>
              {PLAYBACK_SPEEDS.map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[styles.modalOption, playbackSpeed === speed && styles.modalOptionActive]}
                  onPress={() => handleSpeedChange(speed)}
                >
                  <Text style={[styles.modalOptionText, playbackSpeed === speed && styles.modalOptionTextActive]}>
                    {speed}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Sleep Timer Modal */}
        <Modal
          visible={showSleepTimerModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSleepTimerModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowSleepTimerModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Sleep Timer</Text>
              {[5, 10, 15, 30, 45, 60].map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={[styles.modalOption, sleepTimerState.isActive && sleepTimerState.totalSeconds === minutes * 60 && styles.modalOptionActive]}
                  onPress={() => handleSetSleepTimer(minutes)}
                >
                  <Text style={[styles.modalOptionText, sleepTimerState.isActive && sleepTimerState.totalSeconds === minutes * 60 && styles.modalOptionTextActive]}>
                    {minutes} minutes
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalOption, sleepAtEndOfEpisode && styles.modalOptionActive]}
                onPress={() => handleSetSleepTimer(null, true)}
              >
                <Text style={[styles.modalOptionText, sleepAtEndOfEpisode && styles.modalOptionTextActive]}>
                  End of Episode
                </Text>
              </TouchableOpacity>
              {(sleepTimerState.isActive || sleepAtEndOfEpisode) && (
                <TouchableOpacity
                  style={[styles.modalOption, styles.cancelOption]}
                  onPress={() => handleSetSleepTimer(null)}
                >
                  <Text style={styles.cancelOptionText}>Cancel Timer</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Chapters Modal */}
        <Modal
          visible={showChaptersModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowChaptersModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.chaptersModal}>
              <View style={styles.chaptersHeader}>
                <Text style={styles.modalTitle}>Chapters</Text>
                <TouchableOpacity onPress={() => setShowChaptersModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={chapters}
                keyExtractor={(item, index) => `chapter-${index}`}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.chapterItem,
                      currentChapter === item && styles.chapterItemActive,
                    ]}
                    onPress={() => handleChapterSelect(item)}
                  >
                    <Text style={styles.chapterNumber}>{index + 1}</Text>
                    <View style={styles.chapterInfo}>
                      <Text style={styles.chapterTitle}>{item.title}</Text>
                      <Text style={styles.chapterTime}>{formatTime(item.startTime)}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Queue Modal */}
        <Modal
          visible={showQueueModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowQueueModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.queueModal}>
              <View style={styles.queueHeader}>
                <Text style={styles.modalTitle}>Up Next</Text>
                <TouchableOpacity onPress={() => setShowQueueModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
              {queue.length === 0 ? (
                <View style={styles.emptyQueue}>
                  <Text style={styles.emptyQueueText}>No episodes in queue</Text>
                  <Text style={styles.emptyQueueSubtext}>Long press an episode to add it</Text>
                </View>
              ) : (
                <FlatList
                  data={queue}
                  keyExtractor={(item) => item.episode.id}
                  renderItem={({ item, index }) => (
                    <View style={styles.queueItem}>
                      <Text style={styles.queueItemNumber}>{index + 1}</Text>
                      {item.podcast.imageUrl && (
                        <Image source={{ uri: item.podcast.imageUrl }} style={styles.queueItemImage} />
                      )}
                      <View style={styles.queueItemInfo}>
                        <Text style={styles.queueItemTitle} numberOfLines={1}>{item.episode.title}</Text>
                        <Text style={styles.queueItemPodcast} numberOfLines={1}>{item.podcast.title}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.queueRemoveButton}
                        onPress={() => handleRemoveFromQueue(item.episode.id)}
                      >
                        <Text style={styles.queueRemoveButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
              {queue.length > 0 && (
                <TouchableOpacity
                  style={styles.clearQueueButton}
                  onPress={async () => {
                    await PodcastStorageService.clearQueue();
                    setQueue([]);
                  }}
                >
                  <Text style={styles.clearQueueButtonText}>Clear Queue</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>

        {/* Episode Details Modal (for web) */}
        <Modal
          visible={showEpisodeDetails}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEpisodeDetails(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowEpisodeDetails(false)}
          >
            <View style={styles.episodeDetailsModal}>
              {detailEpisode && (
                <>
                  <Text style={styles.episodeDetailsTitle}>{detailEpisode.title}</Text>
                  <ScrollView style={styles.episodeDetailsDescription}>
                    <Text style={styles.episodeDetailsDescriptionText}>{detailEpisode.description}</Text>
                  </ScrollView>
                  <View style={styles.episodeDetailsActions}>
                    <TouchableOpacity
                      style={styles.episodeDetailsButton}
                      onPress={() => {
                        handlePlayEpisode(detailEpisode);
                        setShowEpisodeDetails(false);
                      }}
                    >
                      <Text style={styles.episodeDetailsButtonText}>Play</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.episodeDetailsButton}
                      onPress={() => {
                        handleAddToQueue(detailEpisode);
                        setShowEpisodeDetails(false);
                      }}
                    >
                      <Text style={styles.episodeDetailsButtonText}>Add to Queue</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.episodeDetailsButton}
                      onPress={() => {
                        const progress = episodeProgress.get(detailEpisode.id);
                        if (progress?.completed) {
                          handleMarkAsUnplayed(detailEpisode);
                        } else {
                          handleMarkAsPlayed(detailEpisode);
                        }
                        setShowEpisodeDetails(false);
                      }}
                    >
                      <Text style={styles.episodeDetailsButtonText}>
                        {episodeProgress.get(detailEpisode.id)?.completed ? 'Mark Unplayed' : 'Mark Played'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // Main view with persistent search bar
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Podcasts</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for podcasts..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchPodcasts}
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchPodcasts}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {showSearchResults ? (
        searchResults.length === 0 && !isSearching ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No results found</Text>
            <Text style={styles.emptyStateSubtext}>Try a different search term</Text>
          </View>
        ) : (
          <FlatList
            key="search-results"
            data={searchResults}
            keyExtractor={(item) => item.id}
            style={styles.searchResults}
            contentContainerStyle={styles.searchResultsContent}
            renderItem={({ item }) => {
              const isAdded = savedPodcasts.some((p) => p.id === item.id);
              const isAdding = addingPodcastId === item.id;
              return (
                <View style={styles.searchResultItem}>
                  <TouchableOpacity
                    style={styles.searchResultButton}
                    onPress={() => !isAdded && !isAdding && handleAddPodcast(item)}
                    disabled={isAdding}
                  >
                    {item.imageUrl && (
                      <Image source={{ uri: item.imageUrl }} style={styles.searchResultImage} />
                    )}
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultTitle}>{item.title}</Text>
                      <Text style={styles.searchResultArtist}>{item.artist}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addButton, isAdded && styles.addButtonAdded]}
                    onPress={() => handleAddPodcast(item)}
                    disabled={isAdded || isAdding}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <Text style={styles.addButtonText}>{isAdded ? '✓' : '+'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        isLoadingPodcasts ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your podcasts...</Text>
          </View>
        ) : savedPodcasts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No podcasts yet</Text>
            <Text style={styles.emptyStateSubtext}>Search above to find and add podcasts</Text>
          </View>
        ) : (
          <FlatList
            key="podcast-grid"
            data={savedPodcasts}
            keyExtractor={(item) => item.id}
            numColumns={2}
            style={styles.podcastGrid}
            contentContainerStyle={styles.podcastGridContent}
            columnWrapperStyle={styles.podcastGridRow}
            renderItem={({ item }) => (
              <View style={styles.podcastTile}>
                <TouchableOpacity
                  style={styles.podcastTileButton}
                  onPress={() => handleSelectPodcast(item)}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.podcastTileImage} />
                  ) : (
                    <View style={styles.podcastTilePlaceholder}>
                      <Text style={styles.podcastTilePlaceholderText}>🎙️</Text>
                    </View>
                  )}
                  <Text style={styles.podcastTileTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.podcastTileArtist} numberOfLines={1}>{item.artist}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeTileButton}
                  onPress={() => handleRemovePodcast(item.id, item.title)}
                >
                  <Text style={styles.removeTileButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )
      )}

      {/* Persistent mini player when playing and not in episode view */}
      {currentEpisode && !selectedPodcast && (
        <TouchableOpacity
          style={styles.miniPlayer}
          onPress={() => {
            if (currentPodcast) {
              handleSelectPodcast(currentPodcast);
            }
          }}
        >
          {currentPodcast?.imageUrl && (
            <Image source={{ uri: currentPodcast.imageUrl }} style={styles.miniPlayerImage} />
          )}
          <View style={styles.miniPlayerInfo}>
            <Text style={styles.miniPlayerTitle} numberOfLines={1}>{currentEpisode.title}</Text>
            <Text style={styles.miniPlayerPodcast} numberOfLines={1}>{currentPodcast?.title}</Text>
          </View>
          <TouchableOpacity
            style={styles.miniPlayerButton}
            onPress={(e) => {
              e.stopPropagation();
              handlePauseResume();
            }}
          >
            <Text style={styles.miniPlayerButtonText}>
              {isBuffering ? '⏳' : isPlaying ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
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
    paddingBottom: 16,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  podcastHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  podcastHeaderImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  podcastHeaderInfo: {
    flex: 1,
  },
  podcastHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  podcastHeaderArtist: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  filterBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 15, // Bigger
    paddingVertical: 10, // Bigger
    borderRadius: 10, // Adjust for new size
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonText: {
    fontSize: 16, // Bigger
    color: colors.textPrimary,
    fontWeight: '500',
  },
  queueButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 15, // Bigger
    paddingVertical: 10, // Bigger
    borderRadius: 10, // Adjust for new size
    marginLeft: 'auto',
  },
  queueButtonText: {
    fontSize: 16, // Bigger
    color: colors.background,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 16,
    gap: 16,
    backgroundColor: colors.backgroundSecondary,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: colors.textPrimary,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 56,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
    minWidth: 100,
    minHeight: 56,
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
  searchResults: {
    flex: 1,
  },
  searchResultsContent: {
    padding: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 80,
  },
  searchResultButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  searchResultImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginRight: 16,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  searchResultArtist: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  addButton: {
    minWidth: 70,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  addButtonAdded: {
    backgroundColor: colors.backgroundTertiary,
  },
  addButtonText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.background,
  },
  podcastGrid: {
    flex: 1,
  },
  podcastGridContent: {
    padding: 12,
  },
  podcastGridRow: {
    justifyContent: 'space-between',
  },
  podcastTile: {
    width: '48%',
    marginHorizontal: '1%',
    marginVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  podcastTileButton: {
    padding: 16,
    alignItems: 'center',
    minHeight: 120,
  },
  podcastTileImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  podcastTilePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  podcastTilePlaceholderText: {
    fontSize: 56,
  },
  podcastTileTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
    minHeight: 40,
  },
  podcastTileArtist: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  removeTileButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeTileButtonText: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textMuted,
    marginBottom: 12,
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  episodesList: {
    flex: 1,
  },
  episodesListContent: {
    padding: 8,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 88,
  },
  episodeItemPlayed: {
    opacity: 0.6, // Fade out played episodes
    borderColor: colors.borderLight,
  },
  episodeItemActive: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.primary,
    borderWidth: 3,
    opacity: 1, // Active episode always fully visible
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  episodeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  episodeTitleCompleted: {
    color: colors.textMuted,
  },
  episodeBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  completedBadge: {
    fontSize: 18,
    color: colors.primary,
  },
  downloadedBadge: {
    fontSize: 18,
    color: colors.primary,
  },
  chaptersBadge: {
    fontSize: 12,
    color: colors.primary,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  episodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  episodeDate: {
    fontSize: 16, // Made bigger
    color: colors.textSecondary,
    marginTop: 4, // Add some spacing from title
  },
  episodeDuration: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  downloadProgressContainer: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  downloadProgressBar: {
    height: '100%',
    backgroundColor: colors.accent || colors.primary,
  },
  episodeActions: {
    marginLeft: 12,
  },
  addToQueueButton: {
    padding: 10,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToQueueButtonText: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: 'bold',
    marginTop: -2, // Center visually
  },
  playingIndicator: {
    fontSize: 28,
    color: '#FFFFFF', // White
  },
  player: {
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  playerContent: {
    padding: 20,
  },
  chapterIndicator: {
    backgroundColor: colors.backgroundSecondary,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  chapterIndicatorText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  playerInfo: {
    marginBottom: 12,
  },
  playerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  playerTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  playerTime: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  slider: {
    width: '100%',
    height: 48,
  },
  playerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 16,
  },
  skipButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 0, // Sharp corners
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 2, // Thicker border
    borderColor: colors.border,
    minWidth: 90,
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ skewX: '-30deg' }], // More aggressive slant
  },
  skipButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    transform: [{ skewX: '30deg' }], // Counter-slant text
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: 0, // Sharp corners
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3, // Thicker border for prominence
    borderColor: colors.primary, // Define border color explicitly
    transform: [{ skewX: '-30deg' }], // More aggressive slant
  },
  playButtonText: {
    fontSize: 40,
    color: colors.background,
    transform: [{ skewX: '30deg' }], // Counter-slant text
  },
  extraControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  extraButton: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extraButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: colors.backgroundSecondary,
  },
  modalOptionActive: {
    backgroundColor: colors.primary,
  },
  modalOptionText: {
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalOptionTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  cancelOption: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelOptionText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  closeButton: {
    fontSize: 24,
    color: colors.textMuted,
    padding: 8,
  },
  // Chapters Modal
  chaptersModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  chaptersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chapterItemActive: {
    backgroundColor: colors.backgroundSecondary,
  },
  chapterNumber: {
    width: 32,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chapterInfo: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  chapterTime: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // Queue Modal
  queueModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emptyQueue: {
    padding: 48,
    alignItems: 'center',
  },
  emptyQueueText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptyQueueSubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueItemNumber: {
    width: 32,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  queueItemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  queueItemPodcast: {
    fontSize: 14,
    color: colors.textMuted,
  },
  queueRemoveButton: {
    padding: 8,
  },
  queueRemoveButtonText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  clearQueueButton: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearQueueButtonText: {
    fontSize: 16,
    color: colors.error || '#ff4444',
    fontWeight: '600',
  },
  // Episode Details Modal
  episodeDetailsModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  episodeDetailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  episodeDetailsDescription: {
    maxHeight: 200,
    marginBottom: 16,
  },
  episodeDetailsDescriptionText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  episodeDetailsActions: {
    gap: 8,
  },
  episodeDetailsButton: {
    backgroundColor: colors.backgroundSecondary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  episodeDetailsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // Mini Player
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  miniPlayerImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  miniPlayerInfo: {
    flex: 1,
  },
  miniPlayerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  miniPlayerPodcast: {
    fontSize: 14,
    color: colors.textMuted,
  },
  miniPlayerButton: {
    backgroundColor: colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniPlayerButtonText: {
    fontSize: 24,
    color: colors.background,
  },
});

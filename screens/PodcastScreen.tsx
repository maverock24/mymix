import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import {
  PodcastStorageService,
  Podcast,
  Episode,
  EpisodeProgress,
} from '../services/podcastStorage';

export const PodcastScreen: React.FC = () => {
  const [savedPodcasts, setSavedPodcasts] = useState<Podcast[]>([]);
  const [isLoadingPodcasts, setIsLoadingPodcasts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Podcast[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, EpisodeProgress>>(new Map());
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [addingPodcastId, setAddingPodcastId] = useState<string | null>(null);

  const progressSaveInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadSavedPodcasts();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
    };
  }, []);

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

      console.log('iTunes API response:', data);

      // Filter and validate results - only include podcasts with feedUrl
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

      console.log(`Found ${results.length} valid podcasts`);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching podcasts:', error);
      setSearchResults([]);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to search podcasts. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddPodcast = async (podcast: Podcast) => {
    if (savedPodcasts.some((p) => p.id === podcast.id)) {
      if (Platform.OS !== 'web') {
        Alert.alert('Info', 'This podcast is already in your library');
      }
      return;
    }

    setAddingPodcastId(podcast.id);
    try {
      const updated = await PodcastStorageService.addPodcast(podcast);
      setSavedPodcasts(updated);

      // Clear search and return to subscribed podcasts view
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);

      if (Platform.OS !== 'web') {
        Alert.alert('Success', `Added "${podcast.title}" to your library`);
      }
    } catch (error) {
      console.error('Error adding podcast:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to add podcast');
      }
    } finally {
      setAddingPodcastId(null);
    }
  };

  const handleRemovePodcast = (id: string, title: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Remove Podcast', `Remove "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]);
    } else {
      if (confirm(`Remove podcast "${title}"?`)) {
        PodcastStorageService.removePodcast(id).then((updated) => {
          setSavedPodcasts(updated);
          if (selectedPodcast?.id === id) {
            setSelectedPodcast(null);
            setEpisodes([]);
            if (sound) {
              sound.unloadAsync();
              setSound(null);
              setCurrentEpisode(null);
            }
          }
        });
      }
    }
  };

  const handleSelectPodcast = async (podcast: Podcast) => {
    setSelectedPodcast(podcast);
    setIsLoadingEpisodes(true);

    try {
      // First check if we have cached episodes
      let cachedEpisodes = await PodcastStorageService.getEpisodesForPodcast(podcast.id);

      if (cachedEpisodes.length > 0) {
        setEpisodes(cachedEpisodes);
        // Load progress for these episodes
        const progress = await PodcastStorageService.getProgressForPodcast(podcast.id);
        setEpisodeProgress(progress);
        setIsLoadingEpisodes(false);
      }

      // Fetch fresh episodes from RSS
      const response = await fetch(podcast.feedUrl);
      const rssText = await response.text();
      const freshEpisodes = parseRSSFeed(rssText, podcast.id);

      // Save episodes to cache
      await PodcastStorageService.saveEpisodesForPodcast(podcast.id, freshEpisodes);
      setEpisodes(freshEpisodes);

      // Load progress for episodes
      const progress = await PodcastStorageService.getProgressForPodcast(podcast.id);
      setEpisodeProgress(progress);
    } catch (error) {
      console.error('Error loading episodes:', error);
      if (Platform.OS !== 'web') {
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
          const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*>/);
          const durationMatch = item.match(/<itunes:duration>(.*?)<\/itunes:duration>/s);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/s);

          const title = titleMatch
            ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').trim()
            : `Episode ${index + 1}`;
          const description = descMatch
            ? descMatch[1]
                .replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1')
                .replace(/<[^>]*>/g, '')
                .trim()
            : '';
          const audioUrl = enclosureMatch ? enclosureMatch[1] : '';
          const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toLocaleDateString() : '';

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

          const episodeId = `${podcastId}-episode-${index}`;

          return {
            id: episodeId,
            podcastId,
            title,
            description,
            audioUrl,
            pubDate,
            duration,
          };
        })
        .filter((ep) => ep.audioUrl);
    } catch (error) {
      console.error('Error parsing RSS:', error);
      return [];
    }
  };

  const handlePlayEpisode = async (episode: Episode) => {
    try {
      setIsBuffering(true);

      // Stop current playback
      if (sound) {
        await saveCurrentProgress();
        await sound.unloadAsync();
        setSound(null);
      }

      // Check if we have saved progress
      const savedProgress = await PodcastStorageService.getEpisodeProgress(episode.id);

      // Load and play new episode
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: episode.audioUrl },
        {
          shouldPlay: true,
          positionMillis: savedProgress && !savedProgress.completed ? savedProgress.position : 0,
        }
      );

      setSound(newSound);
      setCurrentEpisode(episode);
      setIsPlaying(true);
      setIsBuffering(false);

      // Set up status update handler
      newSound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);

      // Start auto-saving progress
      startProgressSaving();
    } catch (error) {
      console.error('Error playing episode:', error);
      setIsBuffering(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to play episode');
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

    // Mark as completed
    await PodcastStorageService.saveEpisodeProgress({
      episodeId: currentEpisode.id,
      podcastId: currentEpisode.podcastId,
      position: 0,
      duration: duration,
      lastPlayed: Date.now(),
      completed: true,
    });

    // Update local progress map
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

    setIsPlaying(false);
  };

  const saveCurrentProgress = async () => {
    if (!currentEpisode || !sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        const currentPosition = status.positionMillis || 0;
        const currentDuration = status.durationMillis || 0;

        // Don't save if less than 5 seconds played
        if (currentPosition < 5000) return;

        // Consider completed if within last 30 seconds
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

    // Save progress every 10 seconds
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
      } else {
        await sound.playAsync();
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

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (episodeId: string): number => {
    const progress = episodeProgress.get(episodeId);
    if (!progress || progress.completed) return 0;
    if (progress.duration === 0) return 0;
    return (progress.position / progress.duration) * 100;
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
              setEpisodeProgress(new Map());
              if (sound) {
                saveCurrentProgress();
                sound.unloadAsync();
                setSound(null);
                setIsPlaying(false);
                setCurrentEpisode(null);
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

        {isLoadingEpisodes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading episodes...</Text>
          </View>
        ) : episodes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No episodes available</Text>
          </View>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(item) => item.id}
            style={styles.episodesList}
            contentContainerStyle={styles.episodesListContent}
            renderItem={({ item }) => {
              const progress = episodeProgress.get(item.id);
              const progressPercent = getProgressPercentage(item.id);
              const isCompleted = progress?.completed || false;

              return (
                <TouchableOpacity
                  style={[
                    styles.episodeItem,
                    currentEpisode?.id === item.id && styles.episodeItemActive,
                  ]}
                  onPress={() => handlePlayEpisode(item)}
                >
                  <View style={styles.episodeInfo}>
                    <View style={styles.episodeTitleRow}>
                      <Text style={styles.episodeTitle}>{item.title}</Text>
                      {isCompleted && <Text style={styles.completedBadge}>✓</Text>}
                    </View>
                    {item.description && (
                      <Text style={styles.episodeDescription} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                    <View style={styles.episodeMeta}>
                      {item.pubDate && (
                        <Text style={styles.episodeDate}>{item.pubDate}</Text>
                      )}
                      {item.duration && (
                        <Text style={styles.episodeDuration}>
                          {formatTime(item.duration)}
                        </Text>
                      )}
                    </View>
                    {progressPercent > 0 && (
                      <View style={styles.progressBarContainer}>
                        <View
                          style={[
                            styles.progressBar,
                            { width: `${progressPercent}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                  {currentEpisode?.id === item.id && (
                    <Text style={styles.playingIndicator}>
                      {isBuffering ? '⏳' : isPlaying ? '▶' : '⏸'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {currentEpisode && (
          <View style={styles.player}>
            <View style={styles.playerContent}>
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
            </View>
          </View>
        )}
      </View>
    );
  }

  // Main view with persistent search bar
  return (
    <View style={styles.container}>
      {/* Header with Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Podcasts</Text>
      </View>

      {/* Always Visible Search Bar */}
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

      {/* Content Area - Search Results or Subscribed Podcasts */}
      {showSearchResults ? (
        // Search Results View
        searchResults.length === 0 && !isSearching ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No results found</Text>
            <Text style={styles.emptyStateSubtext}>
              Try a different search term
            </Text>
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
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.searchResultImage}
                      />
                    )}
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultTitle}>{item.title}</Text>
                      <Text style={styles.searchResultArtist}>{item.artist}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.addButton,
                      isAdded && styles.addButtonAdded,
                    ]}
                    onPress={() => handleAddPodcast(item)}
                    disabled={isAdded || isAdding}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <Text style={styles.addButtonText}>
                        {isAdded ? '✓' : '+'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        // Subscribed Podcasts View
        isLoadingPodcasts ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your podcasts...</Text>
          </View>
        ) : savedPodcasts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No podcasts yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Search above to find and add podcasts
            </Text>
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
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.podcastTileImage}
                    />
                  ) : (
                    <View style={styles.podcastTilePlaceholder}>
                      <Text style={styles.podcastTilePlaceholderText}>🎙️</Text>
                    </View>
                  )}
                  <Text style={styles.podcastTileTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.podcastTileArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
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
  episodeItemActive: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.primary,
    borderWidth: 3,
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
  completedBadge: {
    fontSize: 18,
    color: colors.primary,
    marginLeft: 12,
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
    fontSize: 14,
    color: colors.textMuted,
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
  playingIndicator: {
    fontSize: 28,
    marginLeft: 16,
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
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: colors.border,
    minWidth: 80,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 36,
    color: colors.background,
  },
});

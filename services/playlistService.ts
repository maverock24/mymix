import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { Track, Playlist, RepeatMode } from './storage';

export class PlaylistService {
  // Pick a folder and load all audio files from it
  static async pickAudioFileAndFolder(): Promise<{ tracks: Track[]; selectedIndex: number }> {
    try {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        // Use the new SDK 54 pickDirectoryAsync for folder selection
        const directory = await Directory.pickDirectoryAsync();

        // List all files in the directory
        const contents = directory.list();

        // Filter only audio files
        const audioFiles = contents.filter(item => {
          if (item instanceof File) {
            return this.isAudioFileUri(item.uri);
          }
          return false;
        }) as File[];

        // Create tracks from audio files
        const tracks: Track[] = audioFiles.map((file, index) => ({
          id: `track_${Date.now()}_${index}`,
          name: file.name,
          uri: file.uri,
          type: this.getMimeTypeFromUri(file.uri),
        }));

        // Sort alphabetically
        const sortedTracks = tracks.sort((a, b) => a.name.localeCompare(b.name));

        return {
          tracks: sortedTracks,
          selectedIndex: 0, // Start with first track
        };
      } else {
        // Web - fall back to file selection
        const result = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: false,
          multiple: true,
        });

        if (result.canceled) {
          return { tracks: [], selectedIndex: 0 };
        }

        const tracks: Track[] = result.assets.map((file, index) => ({
          id: `track_${Date.now()}_${index}`,
          name: file.name,
          uri: file.uri,
          type: file.mimeType || 'audio/mpeg',
        }));

        const sortedTracks = tracks.sort((a, b) => a.name.localeCompare(b.name));

        return {
          tracks: sortedTracks,
          selectedIndex: 0,
        };
      }
    } catch (error) {
      console.error('Error picking folder/files:', error);
      return { tracks: [], selectedIndex: 0 };
    }
  }

  // Check if URI is an audio file based on extension
  private static isAudioFileUri(uri: string): boolean {
    const lowerUri = uri.toLowerCase();
    return ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'wma'].some(ext =>
      lowerUri.endsWith(`.${ext}`)
    );
  }

  // Get MIME type from URI
  private static getMimeTypeFromUri(uri: string): string {
    const ext = uri.toLowerCase().split('.').pop();
    return this.getMimeTypeFromExtension(ext || '');
  }

  // Get MIME type from extension
  private static getMimeTypeFromExtension(ext: string): string {
    switch (ext.toLowerCase()) {
      case 'mp3':
        return 'audio/mpeg';
      case 'm4a':
        return 'audio/mp4';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      default:
        return 'audio/mpeg';
    }
  }


  // Create shuffled indices array
  static createShuffledIndices(length: number, currentIndex?: number): number[] {
    const indices = Array.from({ length }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // If current index is provided, move it to the front
    if (currentIndex !== undefined) {
      const currentPos = indices.indexOf(currentIndex);
      if (currentPos > 0) {
        [indices[0], indices[currentPos]] = [indices[currentPos], indices[0]];
      }
    }

    return indices;
  }

  // Get next track index based on repeat mode
  static getNextTrackIndex(
    currentIndex: number,
    playlistLength: number,
    repeat: RepeatMode,
    shuffle: boolean,
    shuffledIndices?: number[]
  ): number | null {
    if (playlistLength === 0) return null;

    if (repeat === 'one') {
      return currentIndex;
    }

    if (shuffle && shuffledIndices) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos < shuffledIndices.length - 1) {
        return shuffledIndices[currentShufflePos + 1];
      } else if (repeat === 'all') {
        return shuffledIndices[0];
      }
      return null;
    }

    if (currentIndex < playlistLength - 1) {
      return currentIndex + 1;
    } else if (repeat === 'all') {
      return 0;
    }

    return null;
  }

  // Get previous track index
  static getPreviousTrackIndex(
    currentIndex: number,
    playlistLength: number,
    shuffle: boolean,
    shuffledIndices?: number[]
  ): number | null {
    if (playlistLength === 0) return null;

    if (shuffle && shuffledIndices) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos > 0) {
        return shuffledIndices[currentShufflePos - 1];
      } else {
        return shuffledIndices[shuffledIndices.length - 1];
      }
    }

    if (currentIndex > 0) {
      return currentIndex - 1;
    } else {
      return playlistLength - 1;
    }
  }

  // Format time in MM:SS or HH:MM:SS
  static formatTime(millis: number): string {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Extract artist and title from filename (basic parsing)
  static parseTrackName(filename: string): { artist?: string; title: string } {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Try to parse "Artist - Title" format
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
      };
    }

    return { title: nameWithoutExt };
  }
}

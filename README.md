# MyMix - Dual MP3 Player

A powerful React Native Expo app that lets you play two MP3 playlists simultaneously with independent controls. Perfect for combining background music with audiobooks, podcasts, or ambient sounds.

## Features

### Dual Player System
- **Two Independent Players**: Control two separate playlists at once
- **Play/Pause Control**: Independent playback control for each player
- **Track Navigation**: Skip forward, skip backward, or restart tracks
- **Progress Bars**: Visual playback progress with seek functionality

### Playlist Management
- **Folder Selection**: Select an entire folder to load all audio files at once (Android/iOS)
- **File Selection**: Pick multiple MP3 files at once (Web fallback)
- **Alphabetical Sorting**: Tracks automatically sorted A-Z
- **Saved Playlists**: Save and reload your favorite combinations
- **Track Counter**: See current track position (e.g., "5 / 12")
- **Expandable Playlist View**: Tap to see and select from all tracks

### Playback Controls
- **Shuffle Mode**: Randomize track order
- **Repeat Modes**:
  - Off: Stop at end of playlist
  - All: Loop entire playlist
  - One: Repeat current track
- **Volume Control**: Independent volume sliders (0-100%)
- **Speed Control**: Adjust playback speed (0.5x - 2.0x)
- **Track Progress**: Seek to any position in the track

### Smart Features
- **Auto-Play Next**: Automatically plays next track
- **Lock Screen Controls**: Control playback from lock screen and notifications (Android/iOS)
- **Track Parsing**: Extracts artist and title from filenames
- **State Persistence**: Remembers your playlists and positions
- **Dark Theme**: Easy on the eyes with Supabase-inspired design

## Tech Stack

- React Native with Expo SDK 54
- TypeScript
- expo-av (Audio playback)
- expo-file-system (Folder selection)
- expo-document-picker (File selection fallback)
- expo-media-control (Lock screen controls)
- @react-native-async-storage/async-storage (Android/iOS storage)
- localforage (Web storage)

## Platform Support

- **Android**: Full support with AsyncStorage
- **iOS**: Full support with AsyncStorage
- **Web**: Full support with IndexedDB

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
cd mymix
npm install
```

### Running Locally

#### Web
```bash
npm run web
```

#### iOS (requires macOS)
```bash
npm run ios
```

#### Android
```bash
npm run android
```

## Building for Android

### Development Build with OTA Updates (Recommended)

Use Option 1 (Expo Updates) for development:

1. Build the development client once:
   ```bash
   eas build --platform android --profile development
   ```

2. Install it on your phone

3. For all future updates:
   ```bash
   eas update --branch development
   ```

This way you never need to reinstall APKs - updates happen over-the-air instantly!

### Production Build

```bash
# For APK (testing/distribution)
eas build --platform android --profile preview

# For Google Play Store (AAB)
eas build --platform android --profile production
```

## Usage

### Quick Start

1. **Load Playlist**: Tap the "📁 Load" button on Player 1
2. **Select Folder**: Choose a folder containing your audio files (Android/iOS)
   - Or select multiple MP3 files manually (Web)
3. **Play**: Hit the play button
4. **Load Second Player**: Repeat for Player 2
5. **Mix Audio**: Both tracks play simultaneously!
6. **Lock Screen Controls**: Control playback even when your phone is locked (Android/iOS)

### Player Controls

- **▶/⏸**: Play/Pause
- **⏮**: Previous track (or restart if >3 seconds played)
- **⏭**: Next track
- **🔀**: Shuffle mode
- **🔁/🔂**: Repeat modes (off/all/one)
- **🔊**: Volume control
- **⚡**: Playback speed

### Managing Playlists

- **Save**: Playlists are automatically saved when loaded
- **Reload**: Access saved playlists from the Load modal
- **Delete**: Swipe or tap 🗑 to remove saved playlists
- **Track Selection**: Expand playlist and tap any track to jump to it

### Typical Use Cases

- **Audiobook + Music**: Listen to audiobooks with background music
- **Podcast + Ambience**: Add ambient sounds to podcasts
- **Study Mix**: Combine binaural beats with study music
- **Language Learning**: Play lessons with background music
- **Meditation**: Mix guided meditation with nature sounds

## Project Structure

```
mymix/
├── components/
│   └── SinglePlayer.tsx       # Individual MP3 player component
├── screens/
│   └── MainPlayerScreen.tsx   # Main dual player screen
├── services/
│   ├── storage.ts             # Storage service (AsyncStorage/IndexedDB)
│   └── playlistService.ts     # Playlist & track management
├── theme/
│   └── colors.ts              # Dark theme colors
├── App.tsx                    # Main app component
└── package.json
```

## Storage

### Android/iOS
- Uses **AsyncStorage** for playlist metadata and references
- Audio files remain in their original locations
- Only file URIs are stored (no duplication)

### Web
- Uses **IndexedDB** via localforage
- Stores Blob data for offline access

## Notes

- Recommended file format: MP3, M4A, WAV, OGG, AAC, FLAC
- Folder selection is supported on Android and iOS (SDK 54+)
- Lock screen controls are available on Android and iOS for Player 1
- Files with "Artist - Title" format are automatically parsed
- Player state is automatically saved
- Each player has independent volume and speed controls
- Supports simultaneous playback of 2 tracks
- On iOS, folder access is temporary and requires re-selection after app restart

## License

MIT

# MyMix - Audio Mixing App

A React Native Expo app for mixing and playing two audio files simultaneously (e.g., background music + audiobook). Built with TypeScript and ready for web deployment on Netlify.

## Features

- **Dual Audio Playback**: Play two audio files simultaneously
- **Volume Control**: Adjust volume for each audio track independently
- **Speed Control**: Adjust playback speed (0.5x to 2.0x) for each track
- **Local Storage**: Store audio pairs in IndexedDB for offline access
- **Tile UI**: Browse and select from previously saved audio pairs
- **File Upload**: Select MP3 files from your device

## Tech Stack

- React Native with Expo
- TypeScript
- expo-av (Audio playback)
- localforage (IndexedDB storage)
- expo-document-picker (File selection)

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

## Deploying to Netlify

### Option 1: Deploy via Netlify CLI

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Build the app:
```bash
npm run build
```

3. Deploy:
```bash
netlify deploy --prod --dir=dist
```

### Option 2: Deploy via Netlify Dashboard

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Go to [Netlify](https://app.netlify.com/) and sign in

3. Click "Add new site" → "Import an existing project"

4. Connect your Git repository

5. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

6. Click "Deploy site"

### Option 3: Manual Deploy

1. Build the app:
```bash
npm run build
```

2. Go to [Netlify Drop](https://app.netlify.com/drop)

3. Drag and drop the `dist` folder

## Usage

1. **Add Audio Pair**: Click "+ Add New Audio Pair" button
2. **Name Your Mix**: Enter a name for the audio pair
3. **Select Files**: Choose background music and audiobook files
4. **Save**: Store the pair in IndexedDB
5. **Play**: Select a saved pair from tiles to start playback
6. **Control**: Adjust volume and speed for each track independently

## Project Structure

```
mymix/
├── components/
│   ├── AudioPairTile.tsx      # Tile component for displaying saved pairs
│   └── DualAudioPlayer.tsx    # Dual audio player with controls
├── screens/
│   ├── HomeScreen.tsx          # Main screen with audio pair tiles
│   ├── AddAudioPairScreen.tsx  # Screen to add new audio pairs
│   └── PlayerScreen.tsx        # Player screen
├── services/
│   └── storage.ts              # IndexedDB storage service
├── App.tsx                     # Main app component
├── netlify.toml               # Netlify configuration
└── package.json

```

## Notes

- Audio files are stored as Base64 encoded strings in IndexedDB
- The app works best on web and may have limitations on mobile devices
- Large audio files may take time to load and store

## License

MIT

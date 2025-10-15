import { Platform } from 'react-native';

// Conditionally import expo-media-control only on native platforms
let MediaControl: any = null;
let PlaybackState: any = null;
let Command: any = null;

if (Platform.OS !== 'web') {
  try {
    const mediaControlModule = require('expo-media-control');
    MediaControl = mediaControlModule.MediaControl;
    PlaybackState = mediaControlModule.PlaybackState;
    Command = mediaControlModule.Command;
  } catch (error) {
    console.warn('expo-media-control not available:', error);
  }
}

// Create no-op implementations for web
const noOpMediaControl = {
  enableMediaControls: async () => {},
  addListener: () => () => {},
  removeAllListeners: () => {},
  updateMetadata: async () => {},
  updatePlaybackState: async () => {},
};

const noOpPlaybackState = {
  PLAYING: 3,
  PAUSED: 2,
  STOPPED: 1,
};

const noOpCommand = {
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  NEXT_TRACK: 'nextTrack',
  PREVIOUS_TRACK: 'previousTrack',
};

export const MediaControlExport = MediaControl || noOpMediaControl;
export const PlaybackStateExport = PlaybackState || noOpPlaybackState;
export const CommandExport = Command || noOpCommand;

// Re-export with original names
export {
  MediaControlExport as MediaControl,
  PlaybackStateExport as PlaybackState,
  CommandExport as Command,
};

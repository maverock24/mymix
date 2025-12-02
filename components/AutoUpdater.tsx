import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

// Only import native modules on Android
let RNFS: any = null;
let RNApkInstallerN: any = null;

if (Platform.OS === 'android') {
  try {
    // @ts-ignore
    RNFS = require('react-native-fs');
    // @ts-ignore
    RNApkInstallerN = require('react-native-apk-installer-n');
  } catch (error) {
    console.warn('Failed to load native modules for auto-update:', error);
  }
}

// You will need to replace this with the direct download link of your version.json file on Google Drive.
// The python script will generate this file.
const VERSION_JSON_URL = "https://drive.google.com/uc?export=download&id=1j8BDEZBiNT8GdteTh0IJiYP9IKIqBDT5";
const APK_FILENAME = "app-release.apk";

export const useAutoUpdate = () => {
  useEffect(() => {
    if (Platform.OS !== 'android' || !RNFS || !RNApkInstallerN) return;
    checkAndInstall();
  }, []);

  const checkAndInstall = async () => {
    if (!RNFS || !RNApkInstallerN) return;

    const LOCAL_PATH = `${RNFS.DocumentDirectoryPath}/${APK_FILENAME}`;

    // 1. Check if we have a downloaded update ready to install from a previous session
    const exists = await RNFS.exists(LOCAL_PATH);
    if (exists) {
        // Trigger install immediately on launch
        console.log("Found pending update. Installing...");
        RNApkInstallerN.install(LOCAL_PATH);
        return;
    }

    // 2. If no file is ready, check server for new version
    try {
      const response = await fetch(VERSION_JSON_URL);
      const remoteData = await response.json();
      
      // remoteData should be: { "version": "1.0.1", "apkUrl": "https://..." }
      const currentVersion = Constants.expoConfig?.version; 

      if (remoteData.version !== currentVersion && remoteData.apkUrl) {
        console.log(`New version found (${remoteData.version}). Downloading in background...`);
        downloadUpdate(remoteData.apkUrl, LOCAL_PATH);
      }
    } catch (e) {
      console.error("Failed to check for updates:", e);
    }
  };

  const downloadUpdate = async (url: string, localPath: string) => {
    if (!RNFS) return;

    // Download to a temporary path first
    const tempPath = `${RNFS.DocumentDirectoryPath}/temp_${APK_FILENAME}`;

    try {
      const download = RNFS.downloadFile({
        fromUrl: url,
        toFile: tempPath,
        background: true, // Continue downloading if app is backgrounded
      });

      const result = await download.promise;

      if (result.statusCode === 200) {
        // Rename temp file to final path to mark it as "ready for next launch"
        await RNFS.moveFile(tempPath, localPath);
        console.log("Update downloaded. It will be installed on next launch.");
      } else {
        console.error("Download failed with status:", result.statusCode);
      }
    } catch (e) {
      console.error("Download failed:", e);
    }
  };
};

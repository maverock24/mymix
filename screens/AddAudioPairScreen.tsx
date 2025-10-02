import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { StorageService, AudioFile } from '../services/storage';
import { colors } from '../theme/colors';

interface AddAudioPairScreenProps {
  onCancel: () => void;
  onSave: () => void;
}

export const AddAudioPairScreen: React.FC<AddAudioPairScreenProps> = ({
  onCancel,
  onSave,
}) => {
  const [pairName, setPairName] = useState('');
  const [backgroundMusic, setBackgroundMusic] = useState<AudioFile | null>(null);
  const [audiobook, setAudiobook] = useState<AudioFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingBgMusic, setLoadingBgMusic] = useState(false);
  const [loadingAudiobook, setLoadingAudiobook] = useState(false);

  const convertFileToBlob = async (file: any): Promise<Blob> => {
    // For web platform, the file object has a file property which is already a Blob
    if (Platform.OS === 'web' && file.file) {
      return file.file;
    } else {
      // For mobile platforms, use fetch with the URI to get a blob
      const response = await fetch(file.uri);
      return await response.blob();
    }
  };

  const pickAudiobook = async () => {
    try {
      setLoadingAudiobook(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
      });

      if (result.canceled) {
        setLoadingAudiobook(false);
        return;
      }

      const file = result.assets[0];
      const blobData = await convertFileToBlob(file);

      setAudiobook({
        id: `ab_${Date.now()}`,
        name: file.name,
        data: blobData,
        type: file.mimeType || 'audio/mpeg',
      });

      // Auto-populate pair name with audiobook filename (without extension)
      if (!pairName) {
        const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '');
        setPairName(nameWithoutExtension);
      }
    } catch (error) {
      console.error('Error picking audiobook:', error);
      Alert.alert('Error', 'Failed to pick audiobook file');
    } finally {
      setLoadingAudiobook(false);
    }
  };

  const pickBackgroundMusic = async () => {
    try {
      setLoadingBgMusic(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
      });

      if (result.canceled) {
        setLoadingBgMusic(false);
        return;
      }

      const file = result.assets[0];
      const blobData = await convertFileToBlob(file);

      setBackgroundMusic({
        id: `bg_${Date.now()}`,
        name: file.name,
        data: blobData,
        type: file.mimeType || 'audio/mpeg',
      });
    } catch (error) {
      console.error('Error picking background music:', error);
      Alert.alert('Error', 'Failed to pick background music file');
    } finally {
      setLoadingBgMusic(false);
    }
  };

  const handleSave = async () => {
    if (!pairName.trim()) {
      Alert.alert('Error', 'Please enter a name for this audio pair');
      return;
    }

    if (!backgroundMusic) {
      Alert.alert('Error', 'Please select a background music file');
      return;
    }

    if (!audiobook) {
      Alert.alert('Error', 'Please select an audiobook file');
      return;
    }

    setSaving(true);
    try {
      await StorageService.saveAudioPair({
        name: pairName.trim(),
        backgroundMusic,
        audiobook,
      });
      Alert.alert('Success', 'Audio pair saved successfully');
      onSave();
    } catch (error) {
      console.error('Error saving audio pair:', error);
      Alert.alert('Error', 'Failed to save audio pair');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Add New Audio Pair</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Audiobook</Text>
        <TouchableOpacity
          style={styles.fileButton}
          onPress={pickAudiobook}
          disabled={loadingAudiobook}
        >
          {loadingAudiobook ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.fileButtonText}>
              {audiobook ? audiobook.name : 'Select Audiobook'}
            </Text>
          )}
        </TouchableOpacity>
        {audiobook && !loadingAudiobook && (
          <Text style={styles.fileInfo}>✓ File selected</Text>
        )}
        {loadingAudiobook && (
          <Text style={styles.loadingInfo}>Loading file...</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Background Music</Text>
        <TouchableOpacity
          style={styles.fileButton}
          onPress={pickBackgroundMusic}
          disabled={loadingBgMusic}
        >
          {loadingBgMusic ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.fileButtonText}>
              {backgroundMusic ? backgroundMusic.name : 'Select Background Music'}
            </Text>
          )}
        </TouchableOpacity>
        {backgroundMusic && !loadingBgMusic && (
          <Text style={styles.fileInfo}>✓ File selected</Text>
        )}
        {loadingBgMusic && (
          <Text style={styles.loadingInfo}>Loading file...</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Pair Name</Text>
        <TextInput
          style={styles.input}
          value={pairName}
          onChangeText={setPairName}
          placeholder="e.g., Morning Study Mix"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: colors.textPrimary,
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
  },
  fileButton: {
    backgroundColor: colors.buttonBackground,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  fileInfo: {
    marginTop: 8,
    fontSize: 14,
    color: colors.success,
  },
  loadingInfo: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 50,
  },
  button: {
    flex: 1,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: colors.buttonBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

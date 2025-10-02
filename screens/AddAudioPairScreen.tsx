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
    } catch (error) {
      console.error('Error picking audiobook:', error);
      Alert.alert('Error', 'Failed to pick audiobook file');
    } finally {
      setLoadingAudiobook(false);
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
        <Text style={styles.label}>Pair Name</Text>
        <TextInput
          style={styles.input}
          value={pairName}
          onChangeText={setPairName}
          placeholder="e.g., Morning Study Mix"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Background Music</Text>
        <TouchableOpacity
          style={styles.fileButton}
          onPress={pickBackgroundMusic}
          disabled={loadingBgMusic}
        >
          {loadingBgMusic ? (
            <ActivityIndicator color="#1fb28a" />
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
        <Text style={styles.label}>Audiobook</Text>
        <TouchableOpacity
          style={styles.fileButton}
          onPress={pickAudiobook}
          disabled={loadingAudiobook}
        >
          {loadingAudiobook ? (
            <ActivityIndicator color="#1fb28a" />
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
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
  },
  fileButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  fileButtonText: {
    fontSize: 16,
    color: '#333',
  },
  fileInfo: {
    marginTop: 8,
    fontSize: 14,
    color: '#1fb28a',
  },
  loadingInfo: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
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
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#1fb28a',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

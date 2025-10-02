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

  const convertFileToBase64 = async (uri: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting file to base64:', error);
      throw error;
    }
  };

  const pickBackgroundMusic = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const base64Data = await convertFileToBase64(file.uri);

      setBackgroundMusic({
        id: `bg_${Date.now()}`,
        name: file.name,
        data: base64Data,
        type: file.mimeType || 'audio/mpeg',
      });
    } catch (error) {
      console.error('Error picking background music:', error);
      Alert.alert('Error', 'Failed to pick background music file');
    }
  };

  const pickAudiobook = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const base64Data = await convertFileToBase64(file.uri);

      setAudiobook({
        id: `ab_${Date.now()}`,
        name: file.name,
        data: base64Data,
        type: file.mimeType || 'audio/mpeg',
      });
    } catch (error) {
      console.error('Error picking audiobook:', error);
      Alert.alert('Error', 'Failed to pick audiobook file');
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
        >
          <Text style={styles.fileButtonText}>
            {backgroundMusic ? backgroundMusic.name : 'Select Background Music'}
          </Text>
        </TouchableOpacity>
        {backgroundMusic && (
          <Text style={styles.fileInfo}>✓ File selected</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Audiobook</Text>
        <TouchableOpacity style={styles.fileButton} onPress={pickAudiobook}>
          <Text style={styles.fileButtonText}>
            {audiobook ? audiobook.name : 'Select Audiobook'}
          </Text>
        </TouchableOpacity>
        {audiobook && <Text style={styles.fileInfo}>✓ File selected</Text>}
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

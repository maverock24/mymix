import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { AudioPairTile } from '../components/AudioPairTile';
import { StorageService, AudioPair } from '../services/storage';

interface HomeScreenProps {
  onSelectPair: (pair: AudioPair) => void;
  onAddNew: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectPair,
  onAddNew,
}) => {
  const [audioPairs, setAudioPairs] = useState<AudioPair[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAudioPairs = useCallback(async () => {
    try {
      const pairs = await StorageService.getAllAudioPairs();
      setAudioPairs(pairs);
    } catch (error) {
      console.error('Error loading audio pairs:', error);
      Alert.alert('Error', 'Failed to load audio pairs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAudioPairs();
  }, [loadAudioPairs]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete Audio Pair',
      'Are you sure you want to delete this audio pair?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.deleteAudioPair(id);
              await loadAudioPairs();
            } catch (error) {
              console.error('Error deleting audio pair:', error);
              Alert.alert('Error', 'Failed to delete audio pair');
            }
          },
        },
      ]
    );
  }, [loadAudioPairs]);

  const renderItem = useCallback(({ item }: { item: AudioPair }) => (
    <AudioPairTile
      audioPair={item}
      onPress={() => onSelectPair(item)}
      onDelete={() => handleDelete(item.id)}
    />
  ), [onSelectPair, handleDelete]);

  const keyExtractor = useCallback((item: AudioPair) => item.id, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Audio Mixes</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1fb28a" />
          <Text style={styles.loadingText}>Loading audio pairs...</Text>
        </View>
      ) : audioPairs.length === 0 ? (
        <Text style={styles.emptyText}>
          No audio pairs yet. Tap the + button to add one.
        </Text>
      ) : (
        <FlatList
          data={audioPairs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}

      <TouchableOpacity style={styles.addButton} onPress={onAddNew}>
        <Text style={styles.addButtonText}>+ Add New Audio Pair</Text>
      </TouchableOpacity>
    </View>
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
    marginBottom: 20,
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 50,
  },
  addButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#1fb28a',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { AudioPairTile } from '../components/AudioPairTile';
import { StorageService, AudioPair } from '../services/storage';
import { colors } from '../theme/colors';

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

  const handleDelete = useCallback(async (id: string) => {
    console.log('Delete button clicked for ID:', id);

    // Use window.confirm for web, Alert.alert for native
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to delete this audio pair?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Audio Pair',
            'Are you sure you want to delete this audio pair?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) {
      console.log('Delete cancelled');
      return;
    }

    try {
      console.log('Deleting audio pair:', id);
      await StorageService.deleteAudioPair(id);
      console.log('Audio pair deleted, reloading list...');
      await loadAudioPairs();
      console.log('List reloaded');
    } catch (error) {
      console.error('Error deleting audio pair:', error);
      if (Platform.OS === 'web') {
        alert('Failed to delete audio pair');
      } else {
        Alert.alert('Error', 'Failed to delete audio pair');
      }
    }
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
          <ActivityIndicator size="large" color={colors.primary} />
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
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: colors.textSecondary,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 50,
  },
  addButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  addButtonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

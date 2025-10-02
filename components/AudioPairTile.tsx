import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AudioPair } from '../services/storage';

interface AudioPairTileProps {
  audioPair: AudioPair;
  onPress: () => void;
  onDelete: () => void;
}

export const AudioPairTile: React.FC<AudioPairTileProps> = ({
  audioPair,
  onPress,
  onDelete,
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <TouchableOpacity style={styles.tile} onPress={onPress}>
      <View style={styles.content}>
        <Text style={styles.title}>{audioPair.name}</Text>
        <View style={styles.details}>
          <Text style={styles.label}>Background Music:</Text>
          <Text style={styles.fileName}>{audioPair.backgroundMusic.name}</Text>
          <Text style={styles.label}>Audiobook:</Text>
          <Text style={styles.fileName}>{audioPair.audiobook.name}</Text>
        </View>
        <Text style={styles.date}>{formatDate(audioPair.createdAt)}</Text>
      </View>
      <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  content: {
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  details: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  fileName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  date: {
    fontSize: 11,
    color: '#999',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

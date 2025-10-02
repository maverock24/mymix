import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AudioPair } from '../services/storage';
import { colors } from '../theme/colors';

interface AudioPairTileProps {
  audioPair: AudioPair;
  onPress: () => void;
  onDelete: () => void;
}

export const AudioPairTile = memo<AudioPairTileProps>(({
  audioPair,
  onPress,
  onDelete,
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const handleDelete = (e: any) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    onDelete();
  };

  return (
    <View style={styles.tile}>
      <TouchableOpacity style={styles.content} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.title}>{audioPair.name}</Text>
        <View style={styles.details}>
          <Text style={styles.label}>Background Music:</Text>
          <Text style={styles.fileName}>{audioPair.backgroundMusic.name}</Text>
          <Text style={styles.label}>Audiobook:</Text>
          <Text style={styles.fileName}>{audioPair.audiobook.name}</Text>
        </View>
        <Text style={styles.date}>{formatDate(audioPair.createdAt)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
});

AudioPairTile.displayName = 'AudioPairTile';

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  content: {
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: colors.textPrimary,
  },
  details: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 5,
  },
  fileName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  date: {
    fontSize: 11,
    color: colors.textMuted,
  },
  deleteButton: {
    backgroundColor: colors.error,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
});

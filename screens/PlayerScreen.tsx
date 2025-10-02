import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { DualAudioPlayer } from '../components/DualAudioPlayer';
import { AudioPair } from '../services/storage';

interface PlayerScreenProps {
  audioPair: AudioPair;
  onBack: () => void;
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({
  audioPair,
  onBack,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <DualAudioPlayer audioPair={audioPair} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 15,
    paddingTop: 50,
  },
  backButtonText: {
    fontSize: 16,
    color: '#1fb28a',
    fontWeight: '600',
  },
});

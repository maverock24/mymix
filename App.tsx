import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { HomeScreen } from './screens/HomeScreen';
import { AddAudioPairScreen } from './screens/AddAudioPairScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { AudioPair } from './services/storage';

type Screen = 'home' | 'add' | 'player';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedPair, setSelectedPair] = useState<AudioPair | null>(null);

  const handleSelectPair = (pair: AudioPair) => {
    setSelectedPair(pair);
    setCurrentScreen('player');
  };

  const handleAddNew = () => {
    setCurrentScreen('add');
  };

  const handleCancel = () => {
    setCurrentScreen('home');
  };

  const handleSave = () => {
    setCurrentScreen('home');
  };

  const handleBack = () => {
    setSelectedPair(null);
    setCurrentScreen('home');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      {currentScreen === 'home' && (
        <HomeScreen onSelectPair={handleSelectPair} onAddNew={handleAddNew} />
      )}
      {currentScreen === 'add' && (
        <AddAudioPairScreen onCancel={handleCancel} onSave={handleSave} />
      )}
      {currentScreen === 'player' && selectedPair && (
        <PlayerScreen audioPair={selectedPair} onBack={handleBack} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

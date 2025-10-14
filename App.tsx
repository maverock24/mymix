import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { MainPlayerScreen } from './screens/MainPlayerScreen';
import { colors } from './theme/colors';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <MainPlayerScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainPlayerScreen } from './screens/MainPlayerScreen';
import { PodcastScreen } from './screens/PodcastScreen';
import { colors } from './theme/colors';
import { useAutoUpdate } from './components/AutoUpdater';

const Tab = createBottomTabNavigator();

export default function App() {
  useAutoUpdate();
  
  return (
    <NavigationContainer>
      <View style={styles.container}>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.backgroundSecondary,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              paddingTop: 8,
              paddingBottom: 8,
              height: 60,
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textSecondary,
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="MyMix"
            component={MainPlayerScreen}
            options={{
              tabBarLabel: 'MyMix',
              tabBarIcon: ({ color, size }) => (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color, fontSize: 28 }}>🎵</Text>
                </View>
              ),
            }}
          />
          <Tab.Screen
            name="Podcasts"
            component={PodcastScreen}
            options={{
              tabBarLabel: 'Podcasts',
              tabBarIcon: ({ color, size }) => (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color, fontSize: 28 }}>🎙️</Text>
                </View>
              ),
            }}
          />
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

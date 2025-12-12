import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainPlayerScreen } from './screens/MainPlayerScreen';
import { PodcastScreen } from './screens/PodcastScreen';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { useAutoUpdate } from './components/AutoUpdater';

const Tab = createBottomTabNavigator();

function AppContent() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.void }]}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: 8,
            height: 60,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
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
            tabBarIcon: ({ color }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color, fontSize: 22, fontWeight: 'bold' }}>◈</Text>
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="Podcasts"
          component={PodcastScreen}
          options={{
            tabBarLabel: 'Podcasts',
            tabBarIcon: ({ color }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color, fontSize: 22, fontWeight: 'bold' }}>◉</Text>
              </View>
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

export default function App() {
  useAutoUpdate();

  return (
    <ThemeProvider>
      <NavigationContainer>
        <AppContent />
      </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

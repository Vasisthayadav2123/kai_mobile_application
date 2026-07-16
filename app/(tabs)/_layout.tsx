import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#0f1923',
          borderTopColor: '#1a2d3d',
        },
        tabBarActiveTintColor: '#f0845e',
        tabBarInactiveTintColor: '#4a5f73',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Server Status',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="commands"
        options={{
          title: 'Commands',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="terminal.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistant',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="mic.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="screen"
        options={{
          title: 'Livestream',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="tv.fill" color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
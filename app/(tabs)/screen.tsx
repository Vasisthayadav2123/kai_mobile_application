import { ThemedText } from '@/components/themed-text';
import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';




export default function Screen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Live Stream</ThemedText>
      <ThemedText style={{ marginTop: 10 }}>
       
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 50,
    flex: 1,
  },
});
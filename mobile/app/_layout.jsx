import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SocketProvider } from '../contexts/SocketContext';
import { useThemeColors } from '../constants/theme';
import {
  configureForegroundNotifications,
  addNotificationResponseListener,
  clearNotificationCache,
} from '../services/notificationService';

/**
 * Navigation route protection guard component
 */
function NavigationGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useThemeColors();

  useEffect(() => {
    configureForegroundNotifications().catch((err) => {
      console.warn('[RootLayout] Foreground notifications initialization bypassed:', err?.message);
    });

    let removeListener = () => { };
    addNotificationResponseListener((targetRoute) => {
      if (targetRoute) {
        router.push(targetRoute);
      }
    })
      .then((unsub) => {
        if (typeof unsub === 'function') {
          removeListener = unsub;
        }
      })
      .catch((err) => {
        console.warn('[RootLayout] Notification response listener bypassed:', err?.message);
      });

    return () => {
      removeListener();
    };
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearNotificationCache();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!isAuthenticated && inAppGroup) {
      // Direct unauthenticated users to the login screen
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated users should not stay on login
      router.replace('/(app)');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="+not-found" options={{ title: 'Screen Not Found' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const theme = useThemeColors();

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={theme.statusBarStyle} />
      <AuthProvider>
        <SocketProvider>
          <NavigationGuard />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

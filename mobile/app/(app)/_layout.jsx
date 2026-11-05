import { Stack, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useThemeColors } from '../../constants/theme';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const theme = useThemeColors();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="parking" />
      <Stack.Screen name="occupancy" />
      <Stack.Screen name="incidents/index" />
      <Stack.Screen name="incidents/[id]" />
      <Stack.Screen name="cameras" />
      <Stack.Screen name="unauthorized" options={{ title: 'Access Denied' }} />
    </Stack>
  );
}

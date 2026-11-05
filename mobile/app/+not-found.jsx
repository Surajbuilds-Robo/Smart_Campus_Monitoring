import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Link, Stack } from 'expo-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react-native';
import { useThemeColors, spacing, radius, typography } from '../constants/theme';

export default function NotFoundScreen() {
  const theme = useThemeColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found', headerShown: true }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.iconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
          <AlertTriangle color={theme.warning} size={48} />
        </View>

        <Text style={[styles.title, { color: theme.textPrimary }]}>
          Screen Doesn't Exist
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          The route you are trying to access is not registered in this build.
        </Text>

        <Link href="/" asChild>
          <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]}>
            <ArrowLeft color="#FFFFFF" size={18} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Return to Home</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconWrapper: {
    padding: spacing.lg,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
    maxWidth: 280,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    minHeight: 44,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: typography.body,
  },
});

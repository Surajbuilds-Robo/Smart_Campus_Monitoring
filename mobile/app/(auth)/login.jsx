import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react-native';

import { useThemeColors, spacing, radius, typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { getApiErrorMessage } from '../../services/apiClient';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your campus email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(cleanEmail, password);
      // Upon successful login, Expo Router protection will redirect to /(app)
      router.replace('/(app)');
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Invalid campus credentials or unable to reach authentication server.'
      );
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back to Step 1 Info */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Return to System Overview"
          >
            <ArrowLeft color={theme.textSecondary} size={20} />
            <Text style={[styles.backText, { color: theme.textSecondary }]}>
              System Overview
            </Text>
          </TouchableOpacity>

          {/* Header Branding */}
          <View style={styles.header}>
            <View style={[styles.iconWrapper, { backgroundColor: theme.primary }]}>
              <ShieldCheck color="#FFFFFF" size={32} />
            </View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              Smart Campus
            </Text>
            <Text style={[styles.subtitle, { color: theme.primary }]}>
              Mobile Access Gateway
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              Sign in with your university account credentials to access role-authorized campus monitoring and services.
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.isDark ? '#3E1F1F' : '#FEF2F2',
                  borderColor: theme.error,
                },
              ]}
              accessibilityRole="alert"
            >
              <AlertCircle color={theme.error} size={18} style={styles.errorIcon} />
              <Text style={[styles.errorText, { color: theme.error }]}>
                {errorMessage}
              </Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>
                Campus Email Address
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Mail color={theme.textMuted} size={18} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="e.g. user@campus.edu"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!isSubmitting}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>
                Password
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Lock color={theme.textMuted} size={18} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="Enter your account password"
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  editable={!isSubmitting}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff color={theme.textMuted} size={18} />
                  ) : (
                    <Eye color={theme.textMuted} size={18} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: theme.primary,
                  opacity: isSubmitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <View style={styles.buttonInner}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.submitButtonText}>Authenticating...</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Sign In to Campus</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Seeded Role Guidance Note (Development Environment Only) */}
          {Boolean(typeof __DEV__ !== 'undefined' && __DEV__) && (
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.infoTitle, { color: theme.textPrimary }]}>
                [Development Mode] Supported Roles
              </Text>
              <Text style={[styles.infoDescription, { color: theme.textSecondary }]}>
                Local testing accounts configured on authorization server:
              </Text>
              <View style={styles.roleList}>
                <Text style={[styles.roleItem, { color: theme.textSecondary }]}>
                  • <Text style={{ fontWeight: '600' }}>Super Admin:</Text> admin@campus.edu
                </Text>
                <Text style={[styles.roleItem, { color: theme.textSecondary }]}>
                  • <Text style={{ fontWeight: '600' }}>Dept Head:</Text> depthead@campus.edu
                </Text>
                <Text style={[styles.roleItem, { color: theme.textSecondary }]}>
                  • <Text style={{ fontWeight: '600' }}>Faculty:</Text> faculty@campus.edu
                </Text>
                <Text style={[styles.roleItem, { color: theme.textSecondary }]}>
                  • <Text style={{ fontWeight: '600' }}>Student:</Text> student@campus.edu
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  backText: {
    marginLeft: spacing.xs,
    fontSize: typography.body,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorIcon: {
    marginRight: spacing.sm,
  },
  errorText: {
    fontSize: typography.body,
    flex: 1,
    fontWeight: '500',
  },
  form: {
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.body,
    paddingVertical: 10,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  submitButton: {
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  infoTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  roleList: {
    gap: 4,
  },
  roleItem: {
    fontSize: typography.caption,
  },
});

/**
 * Push & In-App Notification Foundation
 * Manages notification permissions, foreground presentations, notification tap navigation,
 * Android notification channels, local notification scheduling, runtime capability boundaries,
 * and deduplication between Socket.IO events and push alerts.
 */

let notificationsModule = null;
const seenNotificationIds = new Set();
const MAX_SEEN_CACHE = 100;

// State machine for Android notification channel initialization
let channelInitState = {
  attempted: false,
  status: 'uninitialized', // 'uninitialized' | 'configured' | 'unsupported' | 'failed'
  channels: [],
  diagnostic: null,
};

/**
 * Returns current Android channel initialization status
 * @returns {{attempted: boolean, status: string, channels: string[], diagnostic: string|null}}
 */
export function getChannelInitializationStatus() {
  return { ...channelInitState };
}

/**
 * Resets channel initialization state (for tests and environment reload)
 */
export function resetChannelInitializationState() {
  channelInitState = {
    attempted: false,
    status: 'uninitialized',
    channels: [],
    diagnostic: null,
  };
}

/**
 * Dynamically loads expo-notifications to ensure safe execution across
 * React Native runtimes, web, and Node test environments
 */
async function getNotifications() {
  if (notificationsModule !== null) {
    return notificationsModule;
  }

  try {
    const mod = await import('expo-notifications');
    notificationsModule = mod.default || mod;
    return notificationsModule;
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[NotificationService] Native expo-notifications unavailable in current runtime:', error?.message);
    }
    notificationsModule = false;
    return false;
  }
}

/**
 * Evaluates whether remote push notifications and native channels are supported
 * in the active runtime.
 * - In Expo Go on Android (SDK 53+): remote push and native channel providers are unavailable.
 *   A custom development build (`npx expo run:android`) or standalone build is required.
 * - In Web: native push notifications are unsupported; Socket.IO in-app notifications are used.
 * - In Development Client / Standalone: full native push and local notifications are supported.
 * - In Test (Node): graceful fallback.
 * @returns {Promise<{supported: boolean, isExpoGo: boolean, isStandalone: boolean, os: string, reason: string|null}>}
 */
export async function getRuntimeNotificationSupport() {
  let isExpoGo = false;
  let isStandalone = false;
  let os = 'unknown';

  try {
    const { Platform } = await import('react-native');
    os = Platform?.OS || 'unknown';
  } catch {
    // Test environment or non-RN runtime
  }

  try {
    const { isRunningInExpoGo } = await import('expo');
    if (typeof isRunningInExpoGo === 'function') {
      isExpoGo = isRunningInExpoGo();
    }
  } catch {
    // Expo root module unavailable in current environment
  }

  try {
    const ConstantsModule = await import('expo-constants');
    const Constants = ConstantsModule.default || ConstantsModule;
    const env = Constants.executionEnvironment;
    if (env === 'storeClient') {
      isExpoGo = true;
    } else if (env === 'standalone' || env === 'bare') {
      isStandalone = true;
    }
  } catch {
    // expo-constants unavailable in current environment
  }

  if (os === 'web') {
    return {
      supported: false,
      isExpoGo: false,
      isStandalone: false,
      os,
      reason: 'Web runtime uses Socket.IO and in-app alerts for real-time notifications.',
    };
  }

  if (os === 'android' && isExpoGo) {
    return {
      supported: false,
      isExpoGo: true,
      isStandalone: false,
      os,
      reason: 'Remote push notifications require an Android development build (Expo Go removed FCM push in SDK 53+).',
    };
  }

  return {
    supported: true,
    isExpoGo,
    isStandalone,
    os,
    reason: null,
  };
}

/**
 * Configures Android notification channels (required for Android 8.0+ / API 26+)
 * - Runs only on Android.
 * - In Expo Go on Android: Detects that NotificationsChannelsProvider is missing from the Expo Go
 *   runtime shell and cleanly skips channel creation with a dev diagnostic, avoiding repeated attempts.
 * - In Development Build / Standalone: Configures semantic channels ('default', 'campus-emergency', 'campus-updates').
 * - Returns structured result without throwing or blocking app startup.
 * @returns {Promise<{success: boolean, status: string, channels: string[], reason: string|null}>}
 */
export async function setupNotificationChannels() {
  // If we already attempted and determined that channels are unsupported or configured, avoid repeated attempts
  if (channelInitState.attempted && channelInitState.status !== 'uninitialized') {
    return {
      success: channelInitState.status === 'configured',
      status: channelInitState.status,
      channels: [...channelInitState.channels],
      reason: channelInitState.diagnostic,
    };
  }

  channelInitState.attempted = true;

  let os = 'unknown';
  try {
    const { Platform } = await import('react-native');
    os = Platform?.OS || 'unknown';
  } catch {
    // Non-RN or test environment
  }

  // Notification channels only exist on Android
  if (os !== 'android') {
    channelInitState.status = 'unsupported';
    channelInitState.diagnostic = 'Notification channels are only applicable to Android.';
    return {
      success: false,
      status: 'unsupported',
      channels: [],
      reason: channelInitState.diagnostic,
    };
  }

  const runtime = await getRuntimeNotificationSupport();

  // In Expo Go on Android, native NotificationsChannelsProvider is missing from the binary.
  // Calling setNotificationChannelAsync in Expo Go causes NullPointerException: null cannot be cast to non-null type.
  if (runtime.isExpoGo) {
    channelInitState.status = 'unsupported';
    channelInitState.diagnostic =
      'Android notification channels are unavailable in Expo Go (missing native NotificationsChannelsProvider). ' +
      'A custom Android development build (npx expo run:android) is required for native notification channels.';

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(
        `[NotificationService:Diagnostic] ${channelInitState.diagnostic}\n` +
        'Local in-app notifications and Socket.IO alerts remain functional in Expo Go.'
      );
    }

    return {
      success: false,
      status: 'unsupported',
      channels: [],
      reason: channelInitState.diagnostic,
    };
  }

  // Development Client / Standalone Android build
  const Notifications = await getNotifications();
  if (!Notifications || typeof Notifications.setNotificationChannelAsync !== 'function') {
    channelInitState.status = 'unsupported';
    channelInitState.diagnostic = 'expo-notifications native channel manager unavailable in this runtime.';
    return {
      success: false,
      status: 'unsupported',
      channels: [],
      reason: channelInitState.diagnostic,
    };
  }

  try {
    // 1. Default Channel for General Campus Notifications
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Campus Alerts',
      importance: Notifications.AndroidImportance?.HIGH || 4,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // 2. High-Priority Channel for Safety and Security Incidents
    await Notifications.setNotificationChannelAsync('campus-emergency', {
      name: 'Emergency & Incident Alerts',
      importance: Notifications.AndroidImportance?.MAX || 5,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#EF4444',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // 3. Operational Channel for Crowd Density & Parking Telemetry
    await Notifications.setNotificationChannelAsync('campus-updates', {
      name: 'Occupancy & Facility Updates',
      importance: Notifications.AndroidImportance?.DEFAULT || 3,
      vibrationPattern: [0, 200],
      lightColor: '#10B981',
      sound: null,
      enableVibrate: false,
      showBadge: false,
    });

    channelInitState.status = 'configured';
    channelInitState.channels = ['default', 'campus-emergency', 'campus-updates'];
    channelInitState.diagnostic = null;

    return {
      success: true,
      status: 'configured',
      channels: [...channelInitState.channels],
      reason: null,
    };
  } catch (error) {
    channelInitState.status = 'failed';
    channelInitState.diagnostic = error?.message || 'Failed to create Android notification channels.';

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        `[NotificationService:Diagnostic] Android notification channel creation rejected: ${channelInitState.diagnostic}. ` +
        'Run with a development build (npx expo run:android) to link AndroidXNotificationsChannelsProvider.'
      );
    }

    return {
      success: false,
      status: 'failed',
      channels: [],
      reason: channelInitState.diagnostic,
    };
  }
}

/**
 * Configures the foreground notification presentation behavior
 */
export async function configureForegroundNotifications() {
  try {
    const Notifications = await getNotifications();
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Attempt channel setup asynchronously without blocking UI startup
      setupNotificationChannels().catch((err) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.debug('[NotificationService] setupNotificationChannels handled:', err?.message);
        }
      });

      return true;
    }
    return false;
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[NotificationService] configureForegroundNotifications skipped:', error?.message);
    }
    return false;
  }
}

/**
 * Checks current notification permission status without prompting user
 * @returns {Promise<{status: string, granted: boolean, canAskAgain: boolean}>}
 */
export async function checkNotificationPermissions() {
  try {
    const Notifications = await getNotifications();
    if (!Notifications || typeof Notifications.getPermissionsAsync !== 'function') {
      return { status: 'unavailable', granted: false, canAskAgain: false };
    }

    const settings = await Notifications.getPermissionsAsync();
    return {
      status: settings.status,
      granted: settings.granted || settings.status === 'granted',
      canAskAgain: settings.canAskAgain !== false,
    };
  } catch (error) {
    return { status: 'error', granted: false, canAskAgain: false, error: error?.message };
  }
}

/**
 * Requests notification permissions with contextual explanation
 * @returns {Promise<{status: string, granted: boolean, canAskAgain: boolean}>}
 */
export async function requestNotificationPermissions() {
  try {
    const Notifications = await getNotifications();
    if (!Notifications || typeof Notifications.requestPermissionsAsync !== 'function') {
      return { status: 'unavailable', granted: false, canAskAgain: false };
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalSettings = existing;

    if (existing.status !== 'granted') {
      finalSettings = await Notifications.requestPermissionsAsync();
    }

    return {
      status: finalSettings.status,
      granted: finalSettings.granted || finalSettings.status === 'granted',
      canAskAgain: finalSettings.canAskAgain !== false,
    };
  } catch (error) {
    return { status: 'error', granted: false, canAskAgain: false, error: error?.message };
  }
}

/**
 * Schedules or immediately presents a local notification on device
 * @param {object} options
 * @param {string} options.title Notification title
 * @param {string} options.body Notification body
 * @param {object} [options.data] Custom navigation or payload data
 * @param {string} [options.channelId] Android notification channel id
 * @param {object|null} [options.trigger] Scheduling trigger (null = immediate presentation)
 * @returns {Promise<{scheduled: boolean, id: string|null, reason: string|null}>}
 */
export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  channelId = 'default',
  trigger = null,
}) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    return {
      scheduled: false,
      id: null,
      reason: 'Valid notification title is required.',
    };
  }

  if (!body || typeof body !== 'string' || !body.trim()) {
    return {
      scheduled: false,
      id: null,
      reason: 'Valid notification body is required.',
    };
  }

  const Notifications = await getNotifications();
  if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
    return {
      scheduled: false,
      id: null,
      reason: 'Local notification scheduling is unavailable in this runtime environment.',
    };
  }

  try {
    const permission = await checkNotificationPermissions();
    if (!permission.granted) {
      return {
        scheduled: false,
        id: null,
        reason: `Notification permission not granted (status: ${permission.status}).`,
      };
    }

    const content = {
      title: title.trim(),
      body: body.trim(),
      data: data || {},
      sound: true,
    };

    // Attach Android channelId only if channels are confirmed configured on Android
    const channelStatus = getChannelInitializationStatus();
    if (channelStatus.status === 'configured' && channelId) {
      content.channelId = channelId;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content,
      trigger, // null trigger presents immediately
    });

    return {
      scheduled: true,
      id: notificationId,
      reason: null,
    };
  } catch (error) {
    return {
      scheduled: false,
      id: null,
      reason: error?.message || 'Failed to schedule local notification.',
    };
  }
}

/**
 * Cancels a scheduled local notification by ID
 * @param {string} notificationId
 * @returns {Promise<boolean>}
 */
export async function cancelLocalNotification(notificationId) {
  if (!notificationId) return false;
  try {
    const Notifications = await getNotifications();
    if (Notifications && typeof Notifications.cancelScheduledNotificationAsync === 'function') {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Cancels all scheduled local notifications
 * @returns {Promise<boolean>}
 */
export async function cancelAllLocalNotifications() {
  try {
    const Notifications = await getNotifications();
    if (Notifications && typeof Notifications.cancelAllScheduledNotificationsAsync === 'function') {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Obtains Expo push token on physical device in a compatible runtime
 * Remote push notifications require an Android Development Build or Standalone APK (SDK 53+).
 * @returns {Promise<{supported: boolean, token: string|null, reason: string|null}>}
 */
export async function getExpoPushToken() {
  const runtimeSupport = await getRuntimeNotificationSupport();
  if (!runtimeSupport.supported) {
    return {
      supported: false,
      token: null,
      reason: runtimeSupport.reason || 'Push notifications not supported in this runtime environment.',
    };
  }

  // Verify notification permissions before requesting push token
  const permission = await checkNotificationPermissions();
  if (!permission.granted) {
    return {
      supported: false,
      token: null,
      reason: `Notification permission denied or not yet granted (status: ${permission.status}).`,
    };
  }

  const Notifications = await getNotifications();
  if (!Notifications || typeof Notifications.getExpoPushTokenAsync !== 'function') {
    return {
      supported: false,
      token: null,
      reason: 'Push notifications not supported in this runtime environment.',
    };
  }

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync();
    return {
      supported: true,
      token: tokenResult?.data || null,
      reason: null,
    };
  } catch (error) {
    return {
      supported: false,
      token: null,
      reason: error?.message || 'Physical device and development build required for push tokens.',
    };
  }
}

/**
 * Evaluates whether a notification was already processed via Socket.IO or push
 * to avoid duplicate alerts and UI flickers.
 * @param {string} id
 * @returns {boolean}
 */
export function isDuplicateNotification(id) {
  if (!id) return false;
  const strId = String(id);
  if (seenNotificationIds.has(strId)) {
    return true;
  }

  if (seenNotificationIds.size >= MAX_SEEN_CACHE) {
    const oldest = seenNotificationIds.values().next().value;
    seenNotificationIds.delete(oldest);
  }

  seenNotificationIds.add(strId);
  return false;
}

/**
 * Clears the notification deduplication cache (e.g. on logout)
 */
export function clearNotificationCache() {
  seenNotificationIds.clear();
}

/**
 * Resolves appropriate Expo Router navigation destination from notification payload
 * Validates resource identifiers before navigating to protect route boundaries
 * @param {object} payload
 * @returns {string|null}
 */
export function resolveNotificationRoute(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload.data || payload;
  const resourceType = data.resourceType || data.type;
  const resourceId = data.resourceId || data.id;

  if (resourceType === 'incident' || resourceType === 'incident_created' || resourceType === 'incident_updated') {
    if (resourceId && typeof resourceId === 'string' && resourceId.length > 0) {
      return `/(app)/incidents/${resourceId}`;
    }
    return '/(app)/incidents';
  }

  if (resourceType === 'camera_status') {
    return '/(app)/cameras';
  }

  if (resourceType === 'occupancy_warning') {
    return '/(app)/occupancy';
  }

  return '/(app)';
}

/**
 * Registers response listener for user interaction with notifications
 * @param {(route: string, data: object) => void} onNavigate
 * @returns {Promise<() => void>}
 */
export async function addNotificationResponseListener(onNavigate) {
  try {
    const Notifications = await getNotifications();
    if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
      return () => {};
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      const targetRoute = resolveNotificationRoute(data);
      if (targetRoute && typeof onNavigate === 'function') {
        onNavigate(targetRoute, data);
      }
    });

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[NotificationService] addNotificationResponseListener skipped:', error?.message);
    }
    return () => {};
  }
}

export default {
  getChannelInitializationStatus,
  resetChannelInitializationState,
  getRuntimeNotificationSupport,
  setupNotificationChannels,
  configureForegroundNotifications,
  checkNotificationPermissions,
  requestNotificationPermissions,
  scheduleLocalNotification,
  cancelLocalNotification,
  cancelAllLocalNotifications,
  getExpoPushToken,
  isDuplicateNotification,
  clearNotificationCache,
  resolveNotificationRoute,
  addNotificationResponseListener,
};

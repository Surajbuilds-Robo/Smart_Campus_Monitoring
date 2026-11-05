/**
 * Mobile API & Environment Configuration
 * Handles platform-specific development networking without hardcoded secrets
 */

const BACKEND_PORT = 5000;
const API_PREFIX = '/api/v1';

// Safely obtain Platform and Constants across React Native runtime, Web, and Node test runners
let platformOS = 'web';
let detectedHostUri = 'not-detected';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native');
  if (Platform && Platform.OS) {
    platformOS = Platform.OS;
  }
} catch {
  platformOS = 'web';
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ConstantsModule = require('expo-constants');
  const Constants = ConstantsModule.default || ConstantsModule;
  const configObj = Constants.expoConfig || Constants.default?.expoConfig;
  detectedHostUri =
    configObj?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost ||
    'not-detected';
} catch {
  detectedHostUri = 'not-detected';
}

/**
 * Derives a sane development base URL based on runtime platform and environment
 */
function resolveDefaultDevHost() {
  // In a web browser environment, automatically match the browser's current host
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    return `http://${host}:${BACKEND_PORT}${API_PREFIX}`;
  }

  // In Expo Go or mobile development, connect to Metro host's LAN IP
  if (detectedHostUri && detectedHostUri !== 'not-detected') {
    const lanIp = detectedHostUri.split(':')[0];
    if (lanIp && lanIp !== 'localhost' && lanIp !== '127.0.0.1') {
      return `http://${lanIp}:${BACKEND_PORT}${API_PREFIX}`;
    }
  }

  // Android Emulator maps host machine's localhost to 10.0.2.2
  if (platformOS === 'android') {
    return `http://10.0.2.2:${BACKEND_PORT}${API_PREFIX}`;
  }

  // iOS Simulator & general fallback
  return `http://localhost:${BACKEND_PORT}${API_PREFIX}`;
}

const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
const envSocketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
const apiUrl = envApiUrl && envApiUrl.trim().length > 0 ? envApiUrl.trim() : resolveDefaultDevHost();
const socketUrl = envSocketUrl && envSocketUrl.trim().length > 0
  ? envSocketUrl.trim()
  : apiUrl.replace(/\/api\/v1\/?$/, '');

export const config = {
  appName: 'Smart Campus Monitoring',
  version: '1.0.0',
  apiUrl,
  socketUrl,
  isConfiguredViaEnv: Boolean(envApiUrl && envApiUrl.trim().length > 0),
  platform: platformOS,
  hostUri: detectedHostUri,
  backendPort: BACKEND_PORT,
  apiPrefix: API_PREFIX,
};

export default config;

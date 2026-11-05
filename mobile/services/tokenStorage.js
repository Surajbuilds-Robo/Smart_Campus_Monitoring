/**
 * Secure Token Storage for React Native / Expo
 * Uses expo-secure-store on native runtimes with safe fallback for testing/web
 */

const STORAGE_KEY = 'smart_campus_access_token';

// In-memory fallback for non-native runtimes (e.g., Node tests, web)
let inMemoryFallbackToken = null;
let secureStoreModule = null;

/**
 * Dynamically resolves SecureStore to ensure compatibility across native runtimes and Node test runners
 */
async function getSecureStore() {
  if (secureStoreModule !== null) {
    return secureStoreModule;
  }

  try {
    const mod = await import('expo-secure-store');
    secureStoreModule = mod;
    return secureStoreModule;
  } catch {
    secureStoreModule = false;
    return false;
  }
}

/**
 * Persists an access token securely
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function saveToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const store = await getSecureStore();
  if (store && typeof store.setItemAsync === 'function') {
    try {
      await store.setItemAsync(STORAGE_KEY, token, {
        keychainAccessible: store.AFTER_FIRST_UNLOCK,
      });
      return true;
    } catch {
      inMemoryFallbackToken = token;
      return false;
    }
  }

  inMemoryFallbackToken = token;
  return true;
}

/**
 * Retrieves the stored access token
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  const store = await getSecureStore();
  if (store && typeof store.getItemAsync === 'function') {
    try {
      const token = await store.getItemAsync(STORAGE_KEY);
      if (token) return token;
    } catch {
      return inMemoryFallbackToken;
    }
  }

  return inMemoryFallbackToken;
}

/**
 * Removes the stored access token upon logout
 * @returns {Promise<boolean>}
 */
export async function deleteToken() {
  inMemoryFallbackToken = null;

  const store = await getSecureStore();
  if (store && typeof store.deleteItemAsync === 'function') {
    try {
      await store.deleteItemAsync(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

export default {
  saveToken,
  getToken,
  deleteToken,
};

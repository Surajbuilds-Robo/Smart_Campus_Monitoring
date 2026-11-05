/**
 * Mobile Authentication Service
 * Communicates with backend /api/v1/auth endpoints and manages token persistence
 */

import apiClient from './apiClient.js';
import tokenStorage from './tokenStorage.js';

/**
 * Logs in with email and password, persisting the received token
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object, token: string}>}
 */
export async function login(email, password) {
  if (!email || !email.trim()) {
    throw new Error('Please enter your campus email address.');
  }

  if (!password) {
    throw new Error('Please enter your account password.');
  }

  const response = await apiClient.post('/auth/login', {
    email: email.trim(),
    password,
  });

  const { user, token } = response?.data || {};

  if (!user || !token) {
    throw new Error('Authentication response is missing user credentials or token.');
  }

  await tokenStorage.saveToken(token);

  return { user, token };
}

/**
 * Fetches the currently authenticated user's profile from the backend
 * @returns {Promise<object>}
 */
export async function getCurrentUser() {
  const response = await apiClient.get('/auth/me');
  const user = response?.data?.user;

  if (!user) {
    throw new Error('User profile could not be retrieved from the server.');
  }

  return user;
}

/**
 * Logs out the user by discarding the stored token and notifying the backend
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Best effort: client-side token discard is authoritative for stateless JWTs
  } finally {
    await tokenStorage.deleteToken();
  }
}

export default {
  login,
  getCurrentUser,
  logout,
};

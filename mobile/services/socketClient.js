/**
 * Mobile Socket.IO Client Manager
 * Centralized, singleton connection for authorized realtime campus updates
 */

import { io } from 'socket.io-client';
import { config } from '../constants/config.js';

let socketInstance = null;

/**
 * Connects or returns existing Socket.IO connection for an authenticated user session
 * @param {string} token - Valid JWT bearer token
 * @param {string} [customUrl] - Optional URL override (defaults to config.socketUrl)
 * @returns {import('socket.io-client').Socket|null}
 */
export function connectSocket(token, customUrl = null) {
  if (!token || typeof token !== 'string') {
    disconnectSocket();
    return null;
  }

  const cleanToken = token.trim();
  if (cleanToken.length === 0) {
    disconnectSocket();
    return null;
  }

  const targetUrl = customUrl || config.socketUrl;

  // If already connected with the same token, return existing instance
  if (socketInstance) {
    const activeToken = socketInstance.auth?.token;
    if (activeToken === cleanToken) {
      if (!socketInstance.connected) {
        socketInstance.connect();
      }
      return socketInstance;
    }

    // Token changed (e.g. user switch or refresh): close previous session
    disconnectSocket();
  }

  // Create new managed connection singleton
  socketInstance = io(targetUrl, {
    auth: { token: cleanToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    forceNew: false,
  });

  return socketInstance;
}

/**
 * Returns active singleton socket instance
 * @returns {import('socket.io-client').Socket|null}
 */
export function getSocket() {
  return socketInstance;
}

/**
 * Checks whether socket is currently connected
 * @returns {boolean}
 */
export function isSocketConnected() {
  return Boolean(socketInstance && socketInstance.connected);
}

/**
 * Safely closes active socket and strips listeners on logout or session expiration
 */
export function disconnectSocket() {
  if (socketInstance) {
    try {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
    } catch {
      // Ignore cleanup errors
    } finally {
      socketInstance = null;
    }
  }
}

export default {
  connectSocket,
  getSocket,
  isSocketConnected,
  disconnectSocket,
};

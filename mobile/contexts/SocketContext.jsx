/**
 * Mobile Socket Context & Realtime Provider
 * Manages connection lifecycle, event subscriptions, and reconnection telemetry
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  connectSocket,
  disconnectSocket,
  getSocket,
} from '../services/socketClient.js';
import { useAuth } from './AuthContext.jsx';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [lastConnectedAt, setLastConnectedAt] = useState(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setConnected(false);
      setConnectionError(null);
      hasConnectedOnceRef.current = false;
      disconnectSocket();
      return undefined;
    }

    const socket = connectSocket(token);
    if (!socket) {
      setConnected(false);
      return undefined;
    }

    const handleConnect = () => {
      setConnected(true);
      setConnectionError(null);
      setLastConnectedAt(Date.now());

      if (hasConnectedOnceRef.current) {
        // Increment reconnectCount when re-establishing after network interruption
        setReconnectCount((prev) => prev + 1);
      } else {
        hasConnectedOnceRef.current = true;
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleConnectError = (error) => {
      setConnected(false);
      setConnectionError(error?.message || 'Realtime connection failed.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      disconnectSocket();
    };
  }, [token, isAuthenticated]);

  /**
   * Controlled event subscription helper with automated cleanup
   */
  const subscribe = useCallback((eventName, callback) => {
    const socket = getSocket();
    if (!socket || !eventName || typeof callback !== 'function') {
      return () => {};
    }

    socket.on(eventName, callback);

    return () => {
      try {
        socket.off(eventName, callback);
      } catch {
        // Safe unsubscribe
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      socket: getSocket(),
      connected,
      connectionError,
      lastConnectedAt,
      reconnectCount,
      subscribe,
    }),
    [connected, connectionError, lastConnectedAt, reconnectCount, subscribe]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    return {
      socket: null,
      connected: false,
      connectionError: 'SocketProvider not mounted',
      lastConnectedAt: null,
      reconnectCount: 0,
      subscribe: () => () => {},
    };
  }
  return context;
}

export default SocketContext;

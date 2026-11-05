/**
 * Mobile Authentication Context
 * Manages user session lifecycle, token persistence, and session expiration
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

import authService from '../services/authService';
import tokenStorage from '../services/tokenStorage';
import { setUnauthorizedHandler } from '../services/apiClient';
import { clearNotificationCache } from '../services/notificationService';
import {
  isStaff as checkStaff,
  isAdmin as checkAdmin,
  isSuperAdmin as checkSuperAdmin,
  isStudent as checkStudent,
  canAccessRoute as checkRouteAccess,
} from '../constants/permissions';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Clear all in-memory and persistent authentication states
  const clearSession = useCallback(async () => {
    setUser(null);
    setToken(null);
    clearNotificationCache();
    await tokenStorage.deleteToken();
  }, []);

  // Logout action triggered by user or 401 expiration
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
      clearNotificationCache();
      setIsLoading(false);
    }
  }, []);

  // Register unauthorized response handler from API client
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });

    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore existing session during application bootstrap
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const storedToken = await tokenStorage.getToken();
        if (!storedToken) {
          if (isMounted) {
            setUser(null);
            setToken(null);
          }
          return;
        }

        // Validate token with backend /api/v1/auth/me
        const fetchedUser = await authService.getCurrentUser();
        if (isMounted) {
          if (fetchedUser && fetchedUser.isActive) {
            setUser(fetchedUser);
            setToken(storedToken);
          } else {
            await clearSession();
          }
        }
      } catch (err) {
        // Stored token is invalid, expired, or server rejected it
        if (isMounted) {
          await clearSession();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [clearSession]);

  // Login handler
  const login = useCallback(async (email, password) => {
    const result = await authService.login(email, password);
    setUser(result.user);
    setToken(result.token);
    return result;
  }, []);

  // Role helpers
  const role = user?.role || null;
  const isStaff = useMemo(() => checkStaff(role), [role]);
  const isAdmin = useMemo(() => checkAdmin(role), [role]);
  const isSuperAdmin = useMemo(() => checkSuperAdmin(role), [role]);
  const isStudent = useMemo(() => checkStudent(role), [role]);

  const canAccess = useCallback(
    (routeKey) => checkRouteAccess(role, routeKey),
    [role]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      role,
      isLoading,
      isAuthenticated: Boolean(user && token),
      isStaff,
      isAdmin,
      isSuperAdmin,
      isStudent,
      login,
      logout,
      canAccess,
    }),
    [
      user,
      token,
      role,
      isLoading,
      isStaff,
      isAdmin,
      isSuperAdmin,
      isStudent,
      login,
      logout,
      canAccess,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

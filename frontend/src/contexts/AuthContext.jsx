import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import apiClient, { setUnauthorizedHandler } from "../services/apiClient";
import { AuthContext } from "./authContextDefinition";
import constants from "../../../shared/constants.json";

const { roles } = constants;

const STAFF_ROLES = [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY];
const ADMIN_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD];
const CAMERA_MANAGER_ROLES = [roles.SUPER_ADMIN, roles.SECURITY];

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("accessToken") || null;
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    try {
      localStorage.removeItem("accessToken");
    } catch {
      // Ignore localStorage failure in restricted contexts
    }
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearAuth);
    return () => setUnauthorizedHandler(null);
  }, [clearAuth]);

  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem("accessToken");
    if (!currentToken) {
      clearAuth();
      setLoading(false);
      return null;
    }

    try {
      const response = await apiClient.get("/auth/me");
      const fetchedUser = response.data?.data?.user;
      if (fetchedUser) {
        setUser(fetchedUser);
        return fetchedUser;
      }
      clearAuth();
      return null;
    } catch {
      clearAuth();
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const currentToken = localStorage.getItem("accessToken");
      if (!currentToken) {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await apiClient.get("/auth/me");
        if (mounted) {
          const fetchedUser = response.data?.data?.user || null;
          setUser(fetchedUser);
          if (!fetchedUser) {
            clearAuth();
          }
        }
      } catch {
        if (mounted) {
          clearAuth();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, [clearAuth]);

  const login = useCallback(async (email, password) => {
    const response = await apiClient.post("/auth/login", {
      email: email.trim(),
      password,
    });

    const { token: receivedToken, user: receivedUser } =
      response.data?.data || {};

    if (!receivedToken || !receivedUser) {
      throw new Error("Invalid response from authentication server");
    }

    try {
      localStorage.setItem("accessToken", receivedToken);
    } catch {
      // Continue even if localStorage is restricted
    }

    setToken(receivedToken);
    setUser(receivedUser);
    setLoading(false);

    return { token: receivedToken, user: receivedUser };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Best-effort logout; local clearance is authoritative on edge
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const hasRole = useCallback(
    (allowedRoles) => {
      if (!user?.role || !Array.isArray(allowedRoles)) return false;
      return allowedRoles.includes(user.role);
    },
    [user]
  );

  const isStaff = useMemo(
    () => Boolean(user && STAFF_ROLES.includes(user.role)),
    [user]
  );

  const isAdmin = useMemo(
    () => Boolean(user && ADMIN_ROLES.includes(user.role)),
    [user]
  );

  const isSuperAdmin = useMemo(
    () => Boolean(user?.role === roles.SUPER_ADMIN),
    [user]
  );

  const isStudent = useMemo(
    () => Boolean(user?.role === roles.STUDENT),
    [user]
  );

  const isCameraManager = useMemo(
    () => Boolean(user && CAMERA_MANAGER_ROLES.includes(user.role)),
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      isStaff,
      isAdmin,
      isSuperAdmin,
      isCameraManager,
      isStudent,
      login,
      logout,
      refreshUser,
      hasRole,
    }),
    [
      user,
      token,
      loading,
      isStaff,
      isAdmin,
      isSuperAdmin,
      isCameraManager,
      isStudent,
      login,
      logout,
      refreshUser,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

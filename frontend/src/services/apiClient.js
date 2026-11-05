import axios from "axios";

function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.port === "5173") {
      return "/api/v1";
    }
    const { protocol, hostname } = window.location;
    if (hostname) {
      return `${protocol}//${hostname}:5000/api/v1`;
    }
  }
  return import.meta.env?.VITE_API_URL || "http://localhost:5000/api/v1";
}

const API_BASE_URL = getApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

apiClient.interceptors.request.use(
  (config) => {
    // Public authentication endpoints establish new credentials and must never
    // transmit stale or expired Authorization headers from prior sessions.
    const isPublicAuth =
      config.url?.includes("/auth/login") ||
      config.url?.includes("/auth/register");

    if (!isPublicAuth) {
      const token = localStorage.getItem("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      const isLoginRequest = error.config?.url?.includes("/auth/login");

      if (!isLoginRequest) {
        localStorage.removeItem("accessToken");

        if (unauthorizedHandler) {
          unauthorizedHandler();
        } else if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/login"
        ) {
          window.location.replace("/login");
        }
      }
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error, fallback = "An unexpected error occurred.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  // Handle rate limits with exact Retry-After countdown from backend
  if (error.response?.status === 429) {
    const retryHeader = error.response.headers?.["retry-after"];
    const retryData = error.response.data?.retryAfter;
    const retrySeconds = retryHeader ? Number(retryHeader) : retryData ? Number(retryData) : null;

    if (retrySeconds && !isNaN(retrySeconds) && retrySeconds > 0) {
      return `Too many requests. Please retry in ${retrySeconds}s.`;
    }
    if (error.response?.data?.message) return error.response.data.message;
    return "Too many requests. Please try again later.";
  }

  if (error.response?.data?.message) return error.response.data.message;
  if (Array.isArray(error.response?.data?.errors) && error.response.data.errors[0]?.message) {
    return error.response.data.errors[0].message;
  }
  if (error.message) return error.message;
  return fallback;
}

export default apiClient;

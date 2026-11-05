/**
 * Unified Mobile API Client
 * Uses native fetch with automated token injection, 401 handling, and error extraction
 */

import { config } from '../constants/config.js';
import { getToken } from './tokenStorage.js';

let unauthorizedHandler = null;
let isHandlingUnauthorized = false;

/**
 * Registers a global callback for 401 Unauthorized session expirations
 * @param {Function|null} handler
 */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

/**
 * Parses user-friendly error messages from API response structures or network errors
 * @param {any} error
 * @param {string} fallback
 * @returns {string}
 */
export function getApiErrorMessage(error, fallback = 'An unexpected error occurred.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  // Validation errors array from backend express-validator
  if (Array.isArray(error.errors) && error.errors[0]?.message) {
    return error.errors[0].message;
  }

  // Direct backend message
  if (error.message && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
}

/**
 * Core HTTP request dispatcher
 * @param {string} endpoint - Path relative to base URL (e.g. '/auth/login')
 * @param {object} options - Fetch options (method, headers, body)
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  let queryString = '';
  if (options.params && typeof options.params === 'object') {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
    const serialized = searchParams.toString();
    if (serialized) {
      queryString = (endpoint.includes('?') ? '&' : '?') + serialized;
    }
  }

  const url = `${config.apiUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}${queryString}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  // Inject Bearer token if not explicitly provided
  if (!headers.Authorization) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netError) {
    const error = new Error('Network error. Unable to connect to the campus server.');
    error.isNetworkError = true;
    error.originalError = netError;
    throw error;
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const isLoginEndpoint = endpoint.includes('/auth/login');

    // 401 Unauthorized: Session is invalid or expired
    if (response.status === 401) {
      if (!isLoginEndpoint && unauthorizedHandler && !isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        try {
          unauthorizedHandler();
        } finally {
          // Debounce repeated unauthorized calls
          setTimeout(() => {
            isHandlingUnauthorized = false;
          }, 1000);
        }
      }
    }

    const error = new Error(
      data?.message || `Request failed with status code ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    error.errors = data?.errors;
    error.isAuthError = response.status === 401;
    error.isForbiddenError = response.status === 403;
    throw error;
  }

  return data;
}

export const apiClient = {
  get(endpoint, options = {}) {
    const isOptionsObj = options && (options.params || options.headers);
    const params = isOptionsObj ? options.params : undefined;
    const headers = isOptionsObj ? options.headers : options;
    return request(endpoint, { method: 'GET', headers, params });
  },
  post(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  },
  put(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
  },
  patch(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
  },
  delete(endpoint, headers = {}) {
    return request(endpoint, { method: 'DELETE', headers });
  },
};

export default apiClient;

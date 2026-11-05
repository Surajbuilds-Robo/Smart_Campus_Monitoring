import { useState, useRef, useCallback, useEffect } from "react";
import { getApiErrorMessage } from "../services/apiClient";

/**
 * Custom hook for on-demand / lazy data fetching triggered on user action
 * (e.g., clicking a zone card or diagnostics modal).
 *
 * Provides:
 * - In-flight deduplication to avoid duplicate requests for the same resource
 * - Component unmount safety (no state updates on unmounted component)
 * - Loading, error, empty, and retry capabilities
 * - Stale response rejection
 * - Stable execute callback to prevent effect dependency re-fetch loops
 */
export default function useOnClickFetch(fetchFn) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryAfter, setRetryAfter] = useState(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef(null);
  const lastArgsRef = useRef([]);
  const requestCounterRef = useRef(0);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args) => {
      // Return existing in-flight promise to prevent duplicate requests
      if (inFlightRef.current && inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }

      inFlightRef.current = true;

      lastArgsRef.current = args;
      const currentRequestId = ++requestCounterRef.current;

      setLoading(true);
      setError(null);
      setRetryAfter(null);

      const promise = (async () => {
        try {
          const result = await fetchFnRef.current(...args);

          if (mountedRef.current && currentRequestId === requestCounterRef.current) {
            setData(result);
            setError(null);
            setRetryAfter(null);
          }
          return result;
        } catch (err) {
          if (mountedRef.current && currentRequestId === requestCounterRef.current) {
            const status = err.response?.status;
            const retryHeader = err.response?.headers?.["retry-after"] || err.response?.data?.retryAfter;
            const retrySec = retryHeader ? Number(retryHeader) : null;
            if (status === 429 && retrySec) {
              setRetryAfter(retrySec);
            }

            const message = getApiErrorMessage(
              err,
              "Failed to load detailed campus record."
            );
            setError(message);
          }
          throw err;
        } finally {
          inFlightRef.current = false;
          inFlightPromiseRef.current = null;
          if (mountedRef.current && currentRequestId === requestCounterRef.current) {
            setLoading(false);
          }
        }
      })();

      inFlightPromiseRef.current = promise;
      return promise;
    },
    [] // Stable reference - does not recreate and trigger effect loops
  );

  const retry = useCallback(() => {
    return execute(...lastArgsRef.current);
  }, [execute]);

  const reset = useCallback(() => {
    requestCounterRef.current += 1;
    inFlightRef.current = false;
    inFlightPromiseRef.current = null;
    setData(null);
    setLoading(false);
    setError(null);
    setRetryAfter(null);
  }, []);

  return {
    data,
    loading,
    error,
    retryAfter,
    execute,
    retry,
    reset,
    setData,
  };
}

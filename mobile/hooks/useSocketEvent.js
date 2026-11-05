/**
 * Custom hook for subscribing to Socket.IO events with automatic cleanup
 */

import { useEffect, useRef } from 'react';
import { useSocket } from './useSocket.js';

/**
 * Subscribes to a Socket.IO event with automated cleanup on unmount
 * Uses a ref for the handler to avoid resubscribing on every component re-render
 * @param {string} eventName - Socket event to listen to
 * @param {(payload: any) => void} handler - Callback to execute when event fires
 */
export function useSocketEvent(eventName, handler) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!eventName || typeof handlerRef.current !== 'function') {
      return undefined;
    }

    const eventListener = (...args) => {
      if (typeof handlerRef.current === 'function') {
        handlerRef.current(...args);
      }
    };

    const unsubscribe = subscribe(eventName, eventListener);

    return () => {
      unsubscribe();
    };
  }, [eventName, subscribe]);
}

export default useSocketEvent;

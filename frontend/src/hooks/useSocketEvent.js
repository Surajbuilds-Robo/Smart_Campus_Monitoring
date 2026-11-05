import { useEffect, useRef } from "react";
import { useSocket } from "./useSocket";

export function useSocketEvent(eventName, handler) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!eventName || typeof handlerRef.current !== "function") return undefined;

    const eventListener = (...args) => {
      if (typeof handlerRef.current === "function") {
        handlerRef.current(...args);
      }
    };

    return subscribe(eventName, eventListener);
  }, [eventName, subscribe]);
}

export default useSocketEvent;

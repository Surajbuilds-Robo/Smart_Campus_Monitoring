import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { connectSocket, disconnectSocket, getSocket } from "../services/socketClient";
import { SocketContext } from "./socketContextDefinition";

export function SocketProvider({ children, token }) {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return undefined;
    }

    const socketInstance = connectSocket(token);
    if (!socketInstance) {
      return undefined;
    }

    const handleConnect = () => {
      setConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleConnectError = (error) => {
      setConnected(false);
      setConnectionError(error?.message || "Realtime connection failed.");
    };

    socketInstance.on("connect", handleConnect);
    socketInstance.on("disconnect", handleDisconnect);
    socketInstance.on("connect_error", handleConnectError);

    if (socketInstance.connected) {
      handleConnect();
    }

    return () => {
      socketInstance.off("connect", handleConnect);
      socketInstance.off("disconnect", handleDisconnect);
      socketInstance.off("connect_error", handleConnectError);
      disconnectSocket();
    };
  }, [token]);

  const subscribe = useCallback((eventName, callback) => {
    const currentSocket = getSocket();
    if (!currentSocket || !eventName || typeof callback !== "function") {
      return () => {};
    }

    currentSocket.on(eventName, callback);

    return () => {
      currentSocket.off(eventName, callback);
    };
  }, []);

  const value = useMemo(
    () => ({
      socket: getSocket(),
      connected,
      connectionError,
      subscribe,
    }),
    [connected, connectionError, subscribe]
  );

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

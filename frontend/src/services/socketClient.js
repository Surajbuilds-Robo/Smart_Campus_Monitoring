import { io } from "socket.io-client";

function getSocketUrl() {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.port === "5173") {
      return window.location.origin;
    }
    const { protocol, hostname } = window.location;
    if (hostname) {
      return `${protocol}//${hostname}:5000`;
    }
  }
  return import.meta.env?.VITE_SOCKET_URL || "http://localhost:5000";
}

const SOCKET_URL = getSocketUrl();

let socketInstance = null;

export function connectSocket(token) {
  if (!token || typeof token !== "string") {
    disconnectSocket();
    return null;
  }

  const cleanToken = token.trim();

  if (socketInstance) {
    const currentToken = socketInstance.auth?.token;

    if (currentToken === cleanToken) {
      if (!socketInstance.connected) {
        socketInstance.connect();
      }
      return socketInstance;
    }

    disconnectSocket();
  }

  socketInstance = io(SOCKET_URL, {
    auth: { token: cleanToken },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  return socketInstance;
}

export function getSocket() {
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}

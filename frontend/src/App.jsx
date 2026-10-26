import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { useAuth } from "./hooks/useAuth";
import AppRoutes from "./routes/AppRoutes";

function AuthenticatedSocketBridge({ children }) {
  const { user, token } = useAuth();
  return (
    <SocketProvider token={user ? token : null}>
      {children}
    </SocketProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedSocketBridge>
          <AppRoutes />
        </AuthenticatedSocketBridge>
      </AuthProvider>
    </BrowserRouter>
  );
}
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({
  user: userProp,
  allowedRoles,
  loading: loadingProp,
}) {
  const location = useLocation();
  const auth = useAuth();

  const user = userProp !== undefined ? userProp : auth.user;
  const loading = loadingProp !== undefined ? loadingProp : auth.loading;

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 dark:bg-slate-950"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Verifying security session...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user.role)
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

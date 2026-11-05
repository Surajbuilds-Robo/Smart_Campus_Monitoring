import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import DashboardLayout from "../layout/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Cameras from "../pages/Cameras";
import Parking from "../pages/Parking";
import Crowd from "../pages/Crowd";
import Resources from "../pages/Resources";
import Incidents from "../pages/Incidents";
import Notifications from "../pages/Notifications";
import Users from "../pages/Users";
import Unauthorized from "../pages/Unauthorized";
import NotFound from "../pages/NotFound";

import constants from "../../../shared/constants.json";

const { roles } = constants;

const STAFF_ROLES = [
  roles.SUPER_ADMIN,
  roles.SECURITY,
  roles.DEPT_HEAD,
  roles.FACULTY,
];

const ADMIN_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD];

export default function AppRoutes({
  user: userProp,
  loading: loadingProp,
  onLoginSuccess,
  onLogout,
}) {
  const auth = useAuth();
  const user = userProp !== undefined ? userProp : auth.user;
  const loading = loadingProp !== undefined ? loadingProp : auth.loading;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
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
          ) : user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLoginSuccess={onLoginSuccess} />
          )
        }
      />

      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Authenticated Application Boundary */}
      <Route element={<ProtectedRoute user={user} loading={loading} />}>
        <Route element={<DashboardLayout user={user} onLogout={onLogout} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="dashboard" element={<Dashboard />} />

          {/* Staff-Only Capabilities: CCTV Feeds & Security Incidents */}
          <Route element={<ProtectedRoute user={user} allowedRoles={STAFF_ROLES} />}>
            <Route path="cameras" element={<Cameras />} />
            <Route path="incidents" element={<Incidents />} />
          </Route>

          {/* All Authenticated Roles: Parking Availability & Crowd Density */}
          <Route path="parking" element={<Parking />} />
          <Route path="crowd" element={<Crowd />} />
          <Route path="resources" element={<Resources />} />
          <Route path="notifications" element={<Notifications />} />

          {/* Administrator-Only: User Management */}
          <Route element={<ProtectedRoute user={user} allowedRoles={ADMIN_ROLES} />}>
            <Route path="users" element={<Users />} />
          </Route>

          {/* Retired Settings Module - Safe redirect to Dashboard */}
          <Route path="settings" element={<Navigate to="/dashboard" replace />} />

          {/* Catch-all within authenticated layout */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      {/* Standalone Fallback for Unauthenticated Invalid Paths */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Bug Fix Regression Suite — Login Session, Navigation & Race Condition Guards", () => {
  const apiClientPath = path.resolve(__dirname, "../src/services/apiClient.js");
  const authContextPath = path.resolve(__dirname, "../src/contexts/AuthContext.jsx");
  const appRoutesPath = path.resolve(__dirname, "../src/routes/AppRoutes.jsx");
  const loginPath = path.resolve(__dirname, "../src/pages/Login.jsx");
  const topbarPath = path.resolve(__dirname, "../src/layout/Topbar.jsx");

  it("1. verifies apiClient does not attach Authorization header to public auth endpoints", () => {
    const content = fs.readFileSync(apiClientPath, "utf8");
    assert.ok(
      content.includes("/auth/login") && content.includes("/auth/register"),
      "apiClient must explicitly exclude /auth/login and /auth/register from Authorization headers"
    );
    assert.ok(
      content.includes("!isPublicAuth"),
      "Must guard Authorization header attachment against public auth routes"
    );
  });

  it("2. verifies apiClient uses window.location.replace on 401 fallback", () => {
    const content = fs.readFileSync(apiClientPath, "utf8");
    assert.ok(
      content.includes('window.location.replace("/login")'),
      "apiClient fallback must use replace('/login') to avoid trapping user in broken history"
    );
  });

  it("3. verifies AuthContext sets loading: false in clearAuth and login", () => {
    const content = fs.readFileSync(authContextPath, "utf8");
    assert.ok(
      content.includes("clearAuth = useCallback"),
      "AuthContext must define clearAuth"
    );
    // clearAuth must reset loading
    const clearAuthSlice = content.slice(content.indexOf("const clearAuth ="), content.indexOf("const refreshUser ="));
    assert.ok(
      clearAuthSlice.includes("setLoading(false)"),
      "clearAuth must explicitly reset loading to false"
    );

    const loginSlice = content.slice(content.indexOf("const login ="), content.indexOf("const logout ="));
    assert.ok(
      loginSlice.includes("setLoading(false)"),
      "login must explicitly set loading to false upon receiving token"
    );
  });

  it("4. verifies AppRoutes waits for session restoration before rendering /login route", () => {
    const content = fs.readFileSync(appRoutesPath, "utf8");
    const loginRouteSlice = content.slice(content.indexOf('path="/login"'), content.indexOf('path="/unauthorized"'));
    assert.ok(
      loginRouteSlice.includes("loading ?"),
      "AppRoutes must check loading state on /login route"
    );
    assert.ok(
      loginRouteSlice.includes("Verifying security session..."),
      "AppRoutes must display session verification loader during restoration"
    );
    assert.ok(
      loginRouteSlice.includes('<Navigate to="/dashboard" replace />'),
      "AppRoutes must redirect authenticated users to /dashboard"
    );
  });

  it("5. verifies Login.jsx guards against double-click submissions", () => {
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(
      content.includes("isSubmittingRef"),
      "Login must declare isSubmittingRef for synchronous submission locking"
    );
    assert.ok(
      content.includes("isSubmittingRef.current = true"),
      "Login must synchronously lock submission ref in handleSubmit"
    );
    assert.ok(
      content.includes("isSubmittingRef.current = false"),
      "Login must unlock submission ref in finally block"
    );
  });

  it("6. verifies Login.jsx auto-redirects when already authenticated", () => {
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(
      content.includes("auth.isAuthenticated && !auth.loading"),
      "Login must check authentication status and loading state"
    );
    assert.ok(
      content.includes("navigate(destination, { replace: true })"),
      "Login must navigate to destination with replace: true"
    );
  });

  it("7. verifies Login.jsx handles BFCache pageshow events", () => {
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(
      content.includes('window.addEventListener("pageshow"'),
      "Login must listen for pageshow event to recover from browser back cache"
    );
    assert.ok(
      content.includes('window.removeEventListener("pageshow"'),
      "Login must clean up pageshow listener on unmount"
    );
  });

  it("8. verifies Login.jsx normalizes destination to avoid self-redirects", () => {
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(
      content.includes('rawFrom !== "/login"'),
      "Login must ensure rawFrom is not /login to prevent redirect loops"
    );
  });

  it("9. verifies Topbar.jsx redirects to /login on logout", () => {
    const content = fs.readFileSync(topbarPath, "utf8");
    assert.ok(
      content.includes('navigate("/login")'),
      "Topbar handleSignOut must navigate to /login"
    );
  });
});

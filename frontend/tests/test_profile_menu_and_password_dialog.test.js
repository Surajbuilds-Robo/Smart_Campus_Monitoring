import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("UI Enhancement — Top-Right Profile Dropdown & Sidebar Cleanup", () => {
  const layoutDir = path.resolve(__dirname, "../src/layout");

  it("verifies Topbar renders a circular profile button with accessible account menu trigger", () => {
    const topbarPath = path.join(layoutDir, "Topbar.jsx");
    assert.ok(fs.existsSync(topbarPath), "Topbar.jsx must exist");

    const content = fs.readFileSync(topbarPath, "utf8");
    assert.ok(
      content.includes('aria-label="Open account menu"'),
      "Topbar button must have aria-label='Open account menu'"
    );
    assert.ok(
      content.includes('aria-haspopup="menu"'),
      "Topbar button must indicate aria-haspopup='menu'"
    );
    assert.ok(
      content.includes('rounded-full'),
      "Profile button must be circular (rounded-full)"
    );
  });

  it("verifies Topbar dropdown includes user info, Change Password, and Sign out", () => {
    const content = fs.readFileSync(path.join(layoutDir, "Topbar.jsx"), "utf8");

    // Section A: User information
    assert.ok(content.includes("initials"), "Must display fallback initials");
    assert.ok(content.includes("user?.email"), "Must display user email or username");

    // Section B: Change Password
    assert.ok(
      content.includes("Change Password"),
      "Must include Change Password menu item"
    );
    assert.ok(
      content.includes("KeyRound"),
      "Must use key or lock icon for Change Password"
    );

    // Section C: Sign Out
    assert.ok(
      content.includes("Sign out") || content.includes("Signing out..."),
      "Must include Sign out menu item"
    );
    assert.ok(
      content.includes("LogOut"),
      "Must use LogOut icon for Sign out"
    );
    assert.ok(
      content.includes('navigate("/login")'),
      "Must redirect to /login after signing out"
    );
  });

  it("verifies ChangePasswordModal is created with required inputs, toggles, and validation", () => {
    const modalPath = path.join(layoutDir, "ChangePasswordModal.jsx");
    assert.ok(fs.existsSync(modalPath), "ChangePasswordModal.jsx must exist");

    const content = fs.readFileSync(modalPath, "utf8");

    // Accessible dialog semantics
    assert.ok(content.includes('role="dialog"'), "Must declare role='dialog'");
    assert.ok(content.includes('aria-modal="true"'), "Must declare aria-modal='true'");

    // Required fields
    assert.ok(content.includes("currentPassword"), "Must have currentPassword state");
    assert.ok(content.includes("newPassword"), "Must have newPassword state");
    assert.ok(content.includes("confirmPassword"), "Must have confirmPassword state");

    // Show/hide password toggles
    assert.ok(content.includes("showCurrent"), "Must have show/hide for current password");
    assert.ok(content.includes("showNew"), "Must have show/hide for new password");
    assert.ok(content.includes("showConfirm"), "Must have show/hide for confirm password");

    // Password length validation (8 to 128 characters)
    assert.ok(
      content.includes("8") && content.includes("128"),
      "Must enforce password between 8 and 128 characters"
    );

    // Matching validation
    assert.ok(
      content.includes("newPassword !== confirmPassword"),
      "Must validate that new password matches confirmation"
    );

    // Reset fields on close
    assert.ok(
      content.includes("resetForm"),
      "Must clear password fields when modal is closed"
    );
  });

  it("verifies the obsolete bottom-left Sign out button has been removed from Sidebar", () => {
    const sidebarPath = path.join(layoutDir, "Sidebar.jsx");
    assert.ok(fs.existsSync(sidebarPath), "Sidebar.jsx must exist");

    const content = fs.readFileSync(sidebarPath, "utf8");

    // The old button id #sidebar-logout-btn must not exist
    assert.ok(
      !content.includes('id="sidebar-logout-btn"'),
      "Sidebar must not contain the obsolete #sidebar-logout-btn"
    );

    // The LogOut icon must not be used in the sidebar
    assert.ok(
      !content.includes("<LogOut"),
      "Sidebar must not render a LogOut icon"
    );

    // Sidebar navigation items must remain intact
    assert.ok(content.includes("Dashboard"), "Sidebar must keep Dashboard item");
    assert.ok(content.includes("Cameras"), "Sidebar must keep Cameras item");
    assert.ok(content.includes("Incidents"), "Sidebar must keep Incidents item");
  });
});

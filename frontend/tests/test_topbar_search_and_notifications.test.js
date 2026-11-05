import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Topbar — Rounded Pill Search Box & Notification Dropdown Verification", () => {
  const topbarPath = path.resolve(__dirname, "../src/layout/Topbar.jsx");

  it("verifies Topbar file exists on disk", () => {
    assert.ok(fs.existsSync(topbarPath), "Topbar.jsx must exist");
  });

  it("verifies Topbar search input has YouTube-style rounded pill layout", () => {
    const content = fs.readFileSync(topbarPath, "utf8");

    // Rounded pill input styling
    assert.ok(
      content.includes("rounded-l-full"),
      "Search input must have rounded-l-full for pill shape"
    );

    // Attached rounded button
    assert.ok(
      content.includes("rounded-r-full"),
      "Attached search button must have rounded-r-full"
    );

    // Search placeholder and icon
    assert.ok(
      content.includes('placeholder="Search anything..."'),
      "Search input must keep placeholder 'Search anything...'"
    );
    assert.ok(
      content.includes("<Search"),
      "Attached button must contain Search icon"
    );
  });

  it("verifies hardcoded notification count '3' is completely removed and badge is dynamic", () => {
    const content = fs.readFileSync(topbarPath, "utf8");

    // Must not have hardcoded "3" badge
    assert.ok(
      !content.includes(">3<") && !content.includes(">\n              3\n"),
      "Must not render hardcoded notification badge '3'"
    );
    assert.ok(
      !content.includes('3 unread"'),
      "Aria label must not have hardcoded '3 unread'"
    );

    // Dynamic unread count rendering
    assert.ok(
      content.includes("unreadCount > 0"),
      "Notification badge must conditionally render only when unreadCount > 0"
    );
    assert.ok(
      content.includes("unreadCount > 9 ? \"9+\" : unreadCount") ||
      content.includes("unreadCount > 9 ? '9+' : unreadCount"),
      "Badge must format counts exceeding 9 as '9+'"
    );
  });

  it("verifies notification hover and click interaction handlers", () => {
    const content = fs.readFileSync(topbarPath, "utf8");

    assert.ok(
      content.includes("onMouseEnter={handleNotificationMouseEnter}"),
      "Notification container must bind onMouseEnter for hover interaction"
    );
    assert.ok(
      content.includes("onMouseLeave={handleNotificationMouseLeave}"),
      "Notification container must bind onMouseLeave for debounced close"
    );
    assert.ok(
      content.includes("handleNotificationToggle"),
      "Notification bell must support click toggle"
    );
  });

  it("verifies notification dropdown structure matches reference specifications", () => {
    const content = fs.readFileSync(topbarPath, "utf8");

    // Header with title and Settings icon
    assert.ok(
      content.includes("Notifications") && content.includes("Settings"),
      "Notification popover must include 'Notifications' title and Settings icon"
    );

    // Relative timestamps and empty state
    assert.ok(
      content.includes("formatRelativeTime"),
      "Notifications must format timestamps using formatRelativeTime"
    );
    assert.ok(
      content.includes("No notifications"),
      "Dropdown must provide empty state when list has no records"
    );
    assert.ok(
      content.includes("View all notifications"),
      "Dropdown footer must include link to view all notifications"
    );

    // Realtime websocket connection & API service
    assert.ok(
      content.includes("notificationApi.list"),
      "Must load notifications dynamically using notificationApi.list"
    );
    assert.ok(
      content.includes("notification:created"),
      "Must listen to live notification:created websocket event"
    );
  });
});

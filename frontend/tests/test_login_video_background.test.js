import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Login — Premium Video Background & Accessible Fallbacks Verification", () => {
  const loginPath = path.resolve(__dirname, "../src/pages/Login.jsx");
  const publicDir = path.resolve(__dirname, "../public");
  const mp4Path = path.join(publicDir, "videos/campus-bg.mp4");
  const webmPath = path.join(publicDir, "videos/campus-bg.webm");
  const posterPath = path.join(publicDir, "images/campus-poster.jpg");
  const attributionPath = path.join(publicDir, "videos/README.md");

  it("verifies Login.jsx file exists on disk", () => {
    assert.ok(fs.existsSync(loginPath), "Login.jsx must exist");
  });

  it("verifies physical video and poster assets exist in public folder", () => {
    assert.ok(fs.existsSync(mp4Path), "campus-bg.mp4 must exist in public/videos/");
    assert.ok(fs.statSync(mp4Path).size > 100000, "campus-bg.mp4 must be non-empty");

    assert.ok(fs.existsSync(webmPath), "campus-bg.webm must exist in public/videos/");
    assert.ok(fs.statSync(webmPath).size > 100000, "campus-bg.webm must be non-empty");

    assert.ok(fs.existsSync(posterPath), "campus-poster.jpg must exist in public/images/");
    assert.ok(fs.statSync(posterPath).size > 10000, "campus-poster.jpg must be non-empty");

    assert.ok(fs.existsSync(attributionPath), "videos/README.md must document license and source");
    const attribution = fs.readFileSync(attributionPath, "utf8");
    assert.ok(attribution.includes("License"), "Must document video license");
    assert.ok(attribution.includes("CC BY"), "Must document CC BY license");
  });

  it("verifies full-viewport looping background video configuration", () => {
    const content = fs.readFileSync(loginPath, "utf8");

    // Video tag attributes
    assert.ok(content.includes("<video"), "Must render <video> tag");
    assert.ok(content.includes("autoPlay"), "Video must autoplay");
    assert.ok(content.includes("loop"), "Video must loop");
    assert.ok(content.includes("muted"), "Video must remain muted");
    assert.ok(content.includes("playsInline"), "Video must include playsInline for mobile compatibility");
    assert.ok(content.includes("object-cover"), "Video must use object-cover to cover viewport without distortion");
    assert.ok(content.includes("object-center"), "Video must be centered");

    // Dual video sources
    assert.ok(content.includes('src="/videos/campus-bg.mp4"'), "Must specify MP4 source");
    assert.ok(content.includes('src="/videos/campus-bg.webm"'), "Must specify WebM source");
    assert.ok(content.includes('poster="/images/campus-poster.jpg"'), "Must set poster image attribute on video");
  });

  it("verifies stacking order, overlay, and click-through protection", () => {
    const content = fs.readFileSync(loginPath, "utf8");

    // Video container behind card with pointer-events-none
    assert.ok(
      content.includes("pointer-events-none"),
      "Video container must have pointer-events-none to prevent blocking interaction"
    );
    assert.ok(
      content.includes("z-0") || content.includes("absolute inset-0"),
      "Video container must be positioned behind login card"
    );

    // Subtle contrast overlay
    assert.ok(
      content.includes("bg-slate-950") || content.includes("bg-slate-900"),
      "Must render dark translucent overlay for text and card contrast"
    );

    // Login card above video
    assert.ok(
      content.includes("z-10"),
      "Login card must be elevated above background media (z-10)"
    );
  });

  it("verifies accessibility and fallback error handling", () => {
    const content = fs.readFileSync(loginPath, "utf8");

    // Screen reader accessibility
    assert.ok(
      content.includes('aria-hidden="true"'),
      "Video layer must be hidden from screen readers"
    );
    assert.ok(
      content.includes("tabIndex={-1}"),
      "Video must not be focusable via keyboard navigation"
    );

    // Reduced motion preference
    assert.ok(
      content.includes("prefers-reduced-motion"),
      "Must listen to prefers-reduced-motion media query"
    );
    assert.ok(
      content.includes("campus-poster.jpg"),
      "Must render static poster image when reduced motion is preferred"
    );

    // Video error fallback
    assert.ok(
      content.includes("onError"),
      "Video element must bind onError handler for robust fallback"
    );
    assert.ok(
      content.includes("videoError"),
      "Must track video error state"
    );
  });

  it("verifies existing authentication form branding, inputs, and submission are preserved", () => {
    const content = fs.readFileSync(loginPath, "utf8");

    // Branding and headers
    assert.ok(content.includes("ShieldCheck"), "Must preserve ShieldCheck icon");
    assert.ok(content.includes("Smart Campus"), "Must preserve Smart Campus title");
    assert.ok(content.includes("Sign in to access monitoring services"), "Must preserve subtitle");

    // Form inputs and button
    assert.ok(content.includes('id="email"'), "Must preserve email input ID");
    assert.ok(content.includes('placeholder="user@campus.edu"'), "Must preserve email placeholder");
    assert.ok(content.includes('id="password"'), "Must preserve password input ID");
    assert.ok(content.includes('id="login-submit-btn"'), "Must preserve submit button ID");
    assert.ok(content.includes("auth.login"), "Must preserve auth.login API integration");
    assert.ok(content.includes("AlertCircle"), "Must preserve AlertCircle error component");
  });
});

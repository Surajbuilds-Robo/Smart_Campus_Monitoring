import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const themeHistoryPath = path.resolve(__dirname, "../src/theme/theme_history.json");
const indexCssPath = path.resolve(__dirname, "../src/index.css");
const cliPath = path.resolve(__dirname, "../scripts/theme-manager.js");

describe("Theme Version History & Redo Color Theme Verification", () => {
  it("verifies theme_history.json contains Jet Black, Cerulean Blue & Neon Rose palette", () => {
    assert.ok(fs.existsSync(themeHistoryPath), "theme_history.json must exist");
    const data = JSON.parse(fs.readFileSync(themeHistoryPath, "utf8"));

    assert.ok(data.activeVersion, "Must declare activeVersion");
    assert.ok(data.previousVersion, "Must declare previousVersion");
    assert.ok(Array.isArray(data.versions), "Must contain versions array");
    assert.ok(Array.isArray(data.history), "Must contain history log array");

    const jetblackTheme = data.versions.find(
      (v) => v.versionId === "v2.0.0-jetblack-cerulean-neonrose"
    );
    assert.ok(jetblackTheme, "Must include v2.0.0-jetblack-cerulean-neonrose theme version");

    const tokens = jetblackTheme.tokens;
    assert.equal(tokens["--color-jet-black"], "#0A0A0A", "Jet Black must be #0A0A0A");
    assert.equal(tokens["--color-cerulean-blue"], "#007BA7", "Cerulean Blue must be #007BA7");
    assert.equal(tokens["--color-neon-rose"], "#FF2D95", "Neon Rose must be #FF2D95");
    assert.equal(tokens["--color-background"], "#0A0A0A", "Background must be #0A0A0A");
    assert.equal(tokens["--color-surface"], "#141414", "Surface must be #141414");
    assert.equal(tokens["--color-surface-elevated"], "#1D1D1D", "Elevated surface must be #1D1D1D");
    assert.equal(tokens["--color-primary"], "#007BA7", "Primary must be #007BA7");
    assert.equal(tokens["--color-accent"], "#FF2D95", "Accent must be #FF2D95");
    assert.equal(tokens["--color-border"], "#303642", "Border must be #303642");
  });

  it("verifies index.css defines centralized design tokens for Jet Black, Cerulean Blue & Neon Rose", () => {
    assert.ok(fs.existsSync(indexCssPath), "index.css must exist");
    const content = fs.readFileSync(indexCssPath, "utf8");

    assert.ok(content.includes("--color-jet-black: #0A0A0A;"), "index.css must declare --color-jet-black: #0A0A0A;");
    assert.ok(content.includes("--color-cerulean-blue: #007BA7;"), "index.css must declare --color-cerulean-blue: #007BA7;");
    assert.ok(content.includes("--color-neon-rose: #FF2D95;"), "index.css must declare --color-neon-rose: #FF2D95;");
    assert.ok(content.includes("--color-surface: #141414;"), "index.css must declare --color-surface: #141414;");
    assert.ok(content.includes("--color-border: #303642;"), "index.css must declare --color-border: #303642;");
  });

  it("verifies CLI theme manager provides status reporting and redo color theme execution", () => {
    assert.ok(fs.existsSync(cliPath), "CLI script theme-manager.js must exist");

    // 1. Status command
    const statusOutput = execSync(`node "${cliPath}" status`, { encoding: "utf8" });
    assert.ok(statusOutput.includes("Current Active Theme:"), "status must output active theme");
    assert.ok(statusOutput.includes("Previous Theme:"), "status must output previous theme");

    // 2. Backup current state
    const originalJson = fs.readFileSync(themeHistoryPath, "utf8");
    const originalState = JSON.parse(originalJson);
    const expectedNewActive = originalState.previousVersion;
    const expectedNewPrev = originalState.activeVersion;

    try {
      // 3. Run redo command
      const redoOutput = execSync(`node "${cliPath}" redo`, { encoding: "utf8" });
      assert.ok(redoOutput.includes("Successfully restored previous color theme:"), "redo command must output success message");

      // Verify state was inverted safely
      const modifiedState = JSON.parse(fs.readFileSync(themeHistoryPath, "utf8"));
      assert.equal(
        modifiedState.activeVersion,
        expectedNewActive,
        "activeVersion must become the previous version"
      );
      assert.equal(
        modifiedState.previousVersion,
        expectedNewPrev,
        "previousVersion must become the old active version"
      );

      // Verify audit log
      const lastLog = modifiedState.history[modifiedState.history.length - 1];
      assert.equal(lastLog.action, "REDO_THEME", "Must append REDO_THEME to history");
      assert.equal(lastLog.restoredVersionId, expectedNewActive);

      // 4. Redo again to toggle back
      const redoAgainOutput = execSync(`node "${cliPath}" redo`, { encoding: "utf8" });
      assert.ok(redoAgainOutput.includes("Successfully restored previous color theme:"));
      const restoredState = JSON.parse(fs.readFileSync(themeHistoryPath, "utf8"));
      assert.equal(
        restoredState.activeVersion,
        originalState.activeVersion,
        "Must be back to original active version"
      );
    } finally {
      // Restore clean state
      fs.writeFileSync(themeHistoryPath, originalJson, "utf8");
    }
  });
});

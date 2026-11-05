import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Frontend Shared UI Component Foundation", () => {
  const uiDir = path.resolve(__dirname, "../src/components/ui");

  const requiredComponents = [
    "Badge.jsx",
    "Button.jsx",
    "Card.jsx",
    "PageHeader.jsx",
    "LoadingSpinner.jsx",
    "Skeleton.jsx",
    "EmptyState.jsx",
    "Alert.jsx",
    "index.js",
  ];

  it("verifies all required design system components exist on disk", () => {
    for (const file of requiredComponents) {
      const filePath = path.join(uiDir, file);
      assert.ok(
        fs.existsSync(filePath),
        `Component file ${file} must exist in src/components/ui`
      );
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 50, `${file} must contain non-trivial implementation`);
    }
  });

  it("verifies index.js barrel exports all components", () => {
    const indexPath = path.join(uiDir, "index.js");
    const content = fs.readFileSync(indexPath, "utf8");

    assert.ok(content.includes("export { default as Badge }"));
    assert.ok(content.includes("export { default as Button }"));
    assert.ok(content.includes("export {\n  default as Card,"));
    assert.ok(content.includes("export { default as PageHeader }"));
    assert.ok(content.includes("export { default as LoadingSpinner }"));
    assert.ok(content.includes("export { default as Skeleton }"));
    assert.ok(content.includes("export { default as EmptyState }"));
    assert.ok(content.includes("export { default as Alert }"));
  });

  it("verifies components implement accessible roles or attributes", () => {
    const alertContent = fs.readFileSync(path.join(uiDir, "Alert.jsx"), "utf8");
    const spinnerContent = fs.readFileSync(path.join(uiDir, "LoadingSpinner.jsx"), "utf8");

    assert.ok(alertContent.includes('role="alert"'), "Alert must have role=alert");
    assert.ok(spinnerContent.includes('role="status"'), "Spinner must have role=status");
  });
});

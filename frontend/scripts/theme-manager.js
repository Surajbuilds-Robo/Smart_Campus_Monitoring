#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const historyPath = path.resolve(__dirname, "../src/theme/theme_history.json");

function readState() {
  const content = fs.readFileSync(historyPath, "utf8");
  return JSON.parse(content);
}

function writeState(state) {
  fs.writeFileSync(historyPath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

const command = process.argv[2] || "status";

if (command === "status") {
  const state = readState();
  const active = state.versions.find((v) => v.versionId === state.activeVersion);
  const prev = state.versions.find((v) => v.versionId === state.previousVersion);
  console.log("Current Active Theme:", active?.name, `(${state.activeVersion})`);
  console.log("Previous Theme:", prev ? `${prev.name} (${state.previousVersion})` : "None");
} else if (command === "redo" || command === "redo-color-theme") {
  const state = readState();
  if (!state.previousVersion) {
    console.error("Error: No previous color theme available to restore.");
    process.exit(1);
  }

  const prev = state.versions.find((v) => v.versionId === state.previousVersion);
  if (!prev) {
    console.error(`Error: Previous theme ${state.previousVersion} not found in versions.`);
    process.exit(1);
  }

  const current = state.activeVersion;
  state.activeVersion = state.previousVersion;
  state.previousVersion = current;

  state.history.push({
    action: "REDO_THEME",
    restoredVersionId: state.activeVersion,
    previousActiveVersion: current,
    timestamp: new Date().toISOString(),
    description: `Restored theme '${prev.name}' via redo command.`,
  });

  writeState(state);
  console.log(`Successfully restored previous color theme: '${prev.name}' (${state.activeVersion}).`);
} else if (command === "apply") {
  const targetId = process.argv[3];
  if (!targetId) {
    console.error("Usage: node theme-manager.js apply <versionId>");
    process.exit(1);
  }

  const state = readState();
  const target = state.versions.find((v) => v.versionId === targetId);
  if (!target) {
    console.error(`Error: Theme version '${targetId}' not found.`);
    process.exit(1);
  }

  if (state.activeVersion === targetId) {
    console.log(`Theme '${target.name}' is already active.`);
    process.exit(0);
  }

  state.previousVersion = state.activeVersion;
  state.activeVersion = targetId;

  state.history.push({
    action: "APPLY_THEME",
    versionId: targetId,
    fromVersionId: state.previousVersion,
    timestamp: new Date().toISOString(),
    description: `Applied theme '${target.name}'.`,
  });

  writeState(state);
  console.log(`Applied theme: '${target.name}' (${targetId}).`);
} else {
  console.log("Usage: node theme-manager.js [status | redo | apply <versionId>]");
}

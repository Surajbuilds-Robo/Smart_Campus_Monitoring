import defaultHistory from "./theme_history.json";

const STORAGE_ACTIVE_KEY = "campus_theme_active_version";
const STORAGE_PREV_KEY = "campus_theme_previous_version";
const STORAGE_HISTORY_KEY = "campus_theme_history_override";

/**
 * Applies CSS custom properties to the document root element.
 */
export function applyThemeTokens(tokens = {}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("--")) {
      root.style.setProperty(key, value);
    }
  }

  if (tokens.colorScheme) {
    root.style.colorScheme = tokens.colorScheme;
  }
}

/**
 * Reads the persistent theme configuration from localStorage or bundled JSON.
 */
export function getThemeState() {
  if (typeof window === "undefined") return defaultHistory;

  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.activeVersion && parsed.versions) {
        return parsed;
      }
    }
  } catch {}

  return defaultHistory;
}

/**
 * Saves the theme state to persistent storage.
 */
function saveThemeState(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(state));
    localStorage.setItem(STORAGE_ACTIVE_KEY, state.activeVersion);
    if (state.previousVersion) {
      localStorage.setItem(STORAGE_PREV_KEY, state.previousVersion);
    }
    window.dispatchEvent(
      new CustomEvent("campus:themechange", { detail: state })
    );
  } catch {}
}

/**
 * Returns the currently active theme object.
 */
export function getActiveTheme() {
  const state = getThemeState();
  const found = state.versions.find((v) => v.versionId === state.activeVersion);
  return (
    found ||
    state.versions[state.versions.length - 1] || {
      versionId: "v2.0.0-jetblack-cerulean-neonrose",
      name: "Jet Black, Cerulean Blue & Neon Rose",
      tokens: {},
    }
  );
}

/**
 * Returns the previously active theme object, if available.
 */
export function getPreviousTheme() {
  const state = getThemeState();
  if (!state.previousVersion) return null;
  return state.versions.find((v) => v.versionId === state.previousVersion) || null;
}

/**
 * Applies a new theme version, saving the current active theme as the previous version.
 */
export function applyTheme(themeVersionIdOrObj, description = "") {
  const state = { ...getThemeState() };
  let targetVersion;

  if (typeof themeVersionIdOrObj === "string") {
    targetVersion = state.versions.find(
      (v) => v.versionId === themeVersionIdOrObj
    );
    if (!targetVersion) {
      throw new Error(`Theme version '${themeVersionIdOrObj}' not found.`);
    }
  } else if (themeVersionIdOrObj && themeVersionIdOrObj.versionId) {
    targetVersion = themeVersionIdOrObj;
    // Append or replace version in history
    const existingIdx = state.versions.findIndex(
      (v) => v.versionId === targetVersion.versionId
    );
    if (existingIdx !== -1) {
      state.versions[existingIdx] = targetVersion;
    } else {
      state.versions.push(targetVersion);
    }
  } else {
    throw new Error("Invalid theme specification.");
  }

  const formerActive = state.activeVersion;

  // Do not duplicate if already active
  if (formerActive === targetVersion.versionId) {
    applyThemeTokens(targetVersion.tokens);
    return targetVersion;
  }

  state.previousVersion = formerActive;
  state.activeVersion = targetVersion.versionId;

  state.history = state.history || [];
  state.history.push({
    action: "APPLY_THEME",
    versionId: targetVersion.versionId,
    fromVersionId: formerActive,
    timestamp: new Date().toISOString(),
    description: description || `Switched to ${targetVersion.name}`,
  });

  applyThemeTokens(targetVersion.tokens);
  saveThemeState(state);

  return targetVersion;
}

/**
 * Special Anti-Gravity Command: "redo color theme"
 *
 * Restores the complete theme version that was active immediately before
 * the latest theme change.
 */
export function redoColorTheme() {
  const state = { ...getThemeState() };

  if (!state.previousVersion) {
    return {
      success: false,
      message: "No previous color theme is available in history to restore.",
    };
  }

  const previousVersionObj = state.versions.find(
    (v) => v.versionId === state.previousVersion
  );

  if (!previousVersionObj) {
    return {
      success: false,
      message: `Previous theme version '${state.previousVersion}' not found in registry.`,
    };
  }

  const currentActive = state.activeVersion;
  const restoredVersionId = state.previousVersion;

  // Swap active and previous to allow consecutive re-dos / toggles
  state.activeVersion = restoredVersionId;
  state.previousVersion = currentActive;

  state.history = state.history || [];
  state.history.push({
    action: "REDO_THEME",
    restoredVersionId,
    previousActiveVersion: currentActive,
    timestamp: new Date().toISOString(),
    description: `Restored prior theme version '${previousVersionObj.name}' (${restoredVersionId})`,
  });

  applyThemeTokens(previousVersionObj.tokens);
  saveThemeState(state);

  return {
    success: true,
    restoredVersion: previousVersionObj,
    message: `Successfully restored previous color theme: '${previousVersionObj.name}' (${restoredVersionId}).`,
  };
}

/**
 * Initializes and binds the active theme on application startup.
 */
export function initTheme() {
  const activeTheme = getActiveTheme();
  if (activeTheme && activeTheme.tokens) {
    applyThemeTokens(activeTheme.tokens);
  }
  return activeTheme;
}

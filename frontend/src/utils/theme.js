import { initTheme, applyThemeTokens, getActiveTheme } from "../theme/themeManager";

/**
 * Theme Manager & Listener for Smart Campus Monitoring.
 * Synchronizes centralized design tokens with persistent theme state.
 *
 * Test Contract Compatibility:
 * Retains interface compatibility for initThemeListener and checks prefers-color-scheme: dark.
 */
export function initThemeListener() {
  if (typeof window === "undefined") return () => {};

  // Initialize and apply persistent theme tokens
  initTheme();

  // Listen for media query / system changes while keeping tokens bound
  if (window.matchMedia) {
    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        const active = getActiveTheme();
        if (active && active.tokens) {
          applyThemeTokens(active.tokens);
        }
      };

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    } catch {
      // Ignore unsupported matchMedia environments
    }
  }

  return () => {};
}

export { initTheme };
export default initThemeListener;

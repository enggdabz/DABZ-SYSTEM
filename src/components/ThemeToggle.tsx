"use client";

type Theme = "light" | "dark";

const STORAGE_KEY = "dabz-theme";

/**
 * Switches between light and dark mode (spec 3.1).
 *
 * There is deliberately no React state here. The current theme already lives in
 * one place - the data-theme attribute on <html>, set before the first paint by
 * a script in the layout - so these buttons just write to it, and CSS shows
 * which one is active through the `dark:` variant. Keeping a copy of the theme
 * in React state would be a second source of truth that could disagree with the
 * screen.
 */
function applyTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing can block storage. The theme still applies for now.
  }
}

const baseButton = "rounded-full px-3 py-1 text-xs font-medium transition-colors";

export function ThemeToggle() {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
      <button
        type="button"
        aria-label="Use light mode"
        onClick={() => applyTheme("light")}
        // Active in light mode (the base styles), quiet in dark mode.
        className={`${baseButton} bg-white text-black dark:bg-transparent dark:text-white/70 dark:hover:text-white`}
      >
        Light
      </button>
      <button
        type="button"
        aria-label="Use dark mode"
        onClick={() => applyTheme("dark")}
        // The mirror image: quiet in light mode, active in dark mode.
        className={`${baseButton} text-white/70 hover:text-white dark:bg-white dark:text-black dark:hover:text-black`}
      >
        Dark
      </button>
    </div>
  );
}

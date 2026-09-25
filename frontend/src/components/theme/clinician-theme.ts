export type ClinicianTheme = "light" | "dark";

export const CLINICIAN_THEME_STORAGE_KEY = "soomit-clinician-theme";
export const CLINICIAN_THEME_EVENT = "soomit-clinician-theme-change";

export function getAppliedClinicianTheme(): ClinicianTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyClinicianTheme(theme: ClinicianTheme, persist = true) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  if (persist) {
    try {
      window.localStorage.setItem(CLINICIAN_THEME_STORAGE_KEY, theme);
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }
  }
  window.dispatchEvent(new CustomEvent(CLINICIAN_THEME_EVENT, { detail: theme }));
}

export const CLINICIAN_THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const stored = localStorage.getItem("${CLINICIAN_THEME_STORAGE_KEY}");
    const legacyDark = localStorage.getItem("respiratory-dark-mode") === "true";
    const theme = stored === "dark" || stored === "light" ? stored : legacyDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

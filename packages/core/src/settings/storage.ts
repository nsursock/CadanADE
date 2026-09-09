import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, mergeSettings, type CadanSettings } from "./defaults.js";

export function loadSettings(): CadanSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return mergeSettings(JSON.parse(raw) as Partial<CadanSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: CadanSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function patchSettings(partial: Partial<CadanSettings>): CadanSettings {
  const next = mergeSettings({ ...loadSettings(), ...partial });
  saveSettings(next);
  return next;
}

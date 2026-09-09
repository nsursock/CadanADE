import type { ThemeId } from "../types.js";

export interface CadanSettings {
  openrouterApiKey: string;
  providerBaseUrl: string;
  selectedModelId: string;
  themeId: ThemeId;
  threeBackground: boolean;
  perfLite: boolean;
}

export const SETTINGS_STORAGE_KEY = "cadan.settings.v1";

export const DEFAULT_SETTINGS: CadanSettings = {
  openrouterApiKey: "",
  providerBaseUrl: "https://openrouter.ai/api/v1",
  selectedModelId: "openrouter/free",
  themeId: "retrowave",
  threeBackground: false,
  perfLite: false,
};

const LEGACY_DEFAULT_MODEL = "google/gemma-3-27b-it:free";

export function mergeSettings(partial: Partial<CadanSettings> | null | undefined): CadanSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
  if (merged.selectedModelId === LEGACY_DEFAULT_MODEL) {
    merged.selectedModelId = DEFAULT_SETTINGS.selectedModelId;
  }
  return merged;
}

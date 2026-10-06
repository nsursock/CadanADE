import type { ChatDisplayMode, ThemeId } from "../types.js";
import { THEME_IDS } from "../types.js";

/** Frontier-only vs cost-routed agent (bulk reads gated / outlined). */
export type AgentMode = "normal" | "thrift";

export const AGENT_MODES: AgentMode[] = ["normal", "thrift"];
export const CHAT_DISPLAY_MODES: ChatDisplayMode[] = ["compact", "verbose"];

export interface CadanSettings {
  openrouterApiKey: string;
  providerBaseUrl: string;
  selectedModelId: string;
  /** Cheap worker used by Thrift for bulk outlines; empty = deterministic outline only. */
  workerModelId: string;
  agentMode: AgentMode;
  /** Compact: tool names only, hide reasoning. Verbose: reasoning + tool args/results. */
  chatDisplayMode: ChatDisplayMode;
  /** Max completion tokens per model call (OpenRouter max_tokens). */
  maxTokens: number;
  /**
   * Prompt budget in tokens. Older history is trimmed to fit before each model call.
   * Lower it for small-context models; a 400 overflow is retried at a reduced budget.
   */
  promptBudgetTokens: number;
  themeId: ThemeId;
  threeBackground: boolean;
  perfLite: boolean;
  /** Off: notifications stay on screen until dismissed. */
  toastAutoDismiss: boolean;
}

export const SETTINGS_STORAGE_KEY = "cadan.settings.v1";

export const DEFAULT_SETTINGS: CadanSettings = {
  openrouterApiKey: "",
  providerBaseUrl: "https://openrouter.ai/api/v1",
  selectedModelId: "openrouter/free",
  workerModelId: "openrouter/free",
  agentMode: "normal",
  chatDisplayMode: "compact",
  maxTokens: 4096,
  promptBudgetTokens: 24_000,
  themeId: "retrowave",
  threeBackground: false,
  perfLite: false,
  toastAutoDismiss: true,
};

const LEGACY_DEFAULT_MODEL = "google/gemma-3-27b-it:free";

/** Theme ids renamed after v1 — mapped forward so saved settings keep working. */
const LEGACY_THEME_IDS: Record<string, ThemeId> = {
  fiesta: "vibrantFiesta",
  cantina: "cantinaGirl",
};

export function clampMaxTokens(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SETTINGS.maxTokens;
  return Math.min(128_000, Math.max(256, Math.round(v)));
}

/** Clamp the prompt budget: must leave room for a completion inside a 32k window. */
export function clampPromptBudgetTokens(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SETTINGS.promptBudgetTokens;
  return Math.min(1_000_000, Math.max(4_000, Math.round(v)));
}

export function mergeSettings(partial: Partial<CadanSettings> | null | undefined): CadanSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
  if (merged.selectedModelId === LEGACY_DEFAULT_MODEL) {
    merged.selectedModelId = DEFAULT_SETTINGS.selectedModelId;
  }
  if (merged.agentMode !== "normal" && merged.agentMode !== "thrift") {
    merged.agentMode = DEFAULT_SETTINGS.agentMode;
  }
  if (merged.chatDisplayMode !== "verbose" && merged.chatDisplayMode !== "compact") {
    merged.chatDisplayMode = DEFAULT_SETTINGS.chatDisplayMode;
  }
  const migratedTheme = LEGACY_THEME_IDS[merged.themeId as string];
  if (migratedTheme) merged.themeId = migratedTheme;
  if (!(THEME_IDS as readonly string[]).includes(merged.themeId)) {
    merged.themeId = DEFAULT_SETTINGS.themeId;
  }
  merged.maxTokens = clampMaxTokens(merged.maxTokens);
  merged.promptBudgetTokens = clampPromptBudgetTokens(merged.promptBudgetTokens);
  if (typeof merged.toastAutoDismiss !== "boolean") {
    merged.toastAutoDismiss = DEFAULT_SETTINGS.toastAutoDismiss;
  }
  return merged;
}

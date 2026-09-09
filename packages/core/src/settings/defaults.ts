import type { ChatDisplayMode, ThemeId } from "../types.js";

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
  themeId: ThemeId;
  threeBackground: boolean;
  perfLite: boolean;
}

export const SETTINGS_STORAGE_KEY = "cadan.settings.v1";

export const DEFAULT_SETTINGS: CadanSettings = {
  openrouterApiKey: "",
  providerBaseUrl: "https://openrouter.ai/api/v1",
  selectedModelId: "openrouter/free",
  workerModelId: "openrouter/free",
  agentMode: "normal",
  chatDisplayMode: "compact",
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
  if (merged.agentMode !== "normal" && merged.agentMode !== "thrift") {
    merged.agentMode = DEFAULT_SETTINGS.agentMode;
  }
  if (merged.chatDisplayMode !== "verbose" && merged.chatDisplayMode !== "compact") {
    merged.chatDisplayMode = DEFAULT_SETTINGS.chatDisplayMode;
  }
  return merged;
}

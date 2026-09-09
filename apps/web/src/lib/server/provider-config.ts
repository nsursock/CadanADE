import type { AgentMode } from "@cadan/core";

/** In-memory provider config for the Node process (UI Save overrides env). */
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  workerModel: string;
  agentMode: AgentMode;
}

const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";
const DEFAULT_WORKER = process.env.CADAN_WORKER_MODEL ?? "openrouter/free";
const DEFAULT_MODE: AgentMode =
  process.env.CADAN_AGENT_MODE === "thrift" ? "thrift" : "normal";

let config: ProviderConfig = {
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseUrl: process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE,
  model: DEFAULT_MODEL,
  workerModel: DEFAULT_WORKER,
  agentMode: DEFAULT_MODE,
};

export function getProviderConfig(): ProviderConfig {
  return { ...config };
}

export function updateProviderConfig(partial: Partial<ProviderConfig>) {
  config = {
    ...config,
    ...partial,
    apiKey: partial.apiKey !== undefined ? partial.apiKey : config.apiKey,
    baseUrl: partial.baseUrl !== undefined ? partial.baseUrl || DEFAULT_BASE : config.baseUrl,
    model: partial.model !== undefined ? partial.model || DEFAULT_MODEL : config.model,
    workerModel:
      partial.workerModel !== undefined ? partial.workerModel || DEFAULT_WORKER : config.workerModel,
    agentMode:
      partial.agentMode === "thrift" || partial.agentMode === "normal"
        ? partial.agentMode
        : config.agentMode,
  };
  return getProviderConfig();
}

export function hasProviderKey() {
  return Boolean(config.apiKey || process.env.OPENROUTER_API_KEY);
}

/** In-memory provider config for the Node process (UI Save overrides env). */
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";

let config: ProviderConfig = {
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseUrl: process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE,
  model: DEFAULT_MODEL,
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
  };
  return getProviderConfig();
}

export function hasProviderKey() {
  return Boolean(config.apiKey || process.env.OPENROUTER_API_KEY);
}

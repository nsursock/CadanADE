import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getProviderConfig, hasProviderKey, updateProviderConfig } from "$lib/server/provider-config";

export const GET: RequestHandler = async () => {
  const cfg = getProviderConfig();
  return json({
    hasKey: hasProviderKey(),
    keyHint: cfg.apiKey ? `••••${cfg.apiKey.slice(-4)}` : null,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    workerModel: cfg.workerModel,
    agentMode: cfg.agentMode,
    fromEnv: Boolean(process.env.OPENROUTER_API_KEY) && !cfg.apiKey,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const next = updateProviderConfig({
    apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl.trim() : undefined,
    model: typeof body.model === "string" ? body.model.trim() : undefined,
    workerModel: typeof body.workerModel === "string" ? body.workerModel.trim() : undefined,
    agentMode: body.agentMode === "thrift" || body.agentMode === "normal" ? body.agentMode : undefined,
  });
  return json({
    ok: true,
    hasKey: Boolean(next.apiKey),
    keyHint: next.apiKey ? `••••${next.apiKey.slice(-4)}` : null,
    baseUrl: next.baseUrl,
    model: next.model,
    workerModel: next.workerModel,
    agentMode: next.agentMode,
  });
};

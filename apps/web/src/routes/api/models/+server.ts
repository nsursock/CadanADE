import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getProviderConfig } from "$lib/server/provider-config";

const ROUTERS = [
  { id: "openrouter/free", name: "OpenRouter Free (auto)" },
  { id: "openrouter/auto", name: "OpenRouter Auto (paid)" },
];

/** Fetch OpenRouter model catalog when a key is configured. */
export const GET: RequestHandler = async () => {
  const cfg = getProviderConfig();
  if (!cfg.apiKey) {
    return json({ free: ROUTERS.slice(0, 1), paid: [], error: "No API key configured" }, { status: 400 });
  }

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "HTTP-Referer": "http://localhost:5175",
        "X-Title": "CadanADE",
      },
    });
    if (!res.ok) {
      return json({ free: ROUTERS.slice(0, 1), paid: [], error: `OpenRouter ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as {
      data?: Array<{ id: string; name?: string; pricing?: { prompt?: string } }>;
    };
    const free: { id: string; name: string }[] = [];
    const paid: { id: string; name: string }[] = [];
    for (const m of data.data ?? []) {
      const entry = { id: m.id, name: m.name ?? m.id };
      const prompt = m.pricing?.prompt;
      if (m.id.includes(":free") || prompt === "0" || prompt === "0.0") free.push(entry);
      else paid.push(entry);
    }
    free.sort((a, b) => a.id.localeCompare(b.id));
    paid.sort((a, b) => a.id.localeCompare(b.id));
    return json({
      free: [ROUTERS[0]!, ...free.filter((m) => m.id !== "openrouter/free")].slice(0, 81),
      paid: [ROUTERS[1]!, ...paid.filter((m) => m.id !== "openrouter/auto")].slice(0, 81),
    });
  } catch (e) {
    return json(
      {
        free: ROUTERS.slice(0, 1),
        paid: [],
        error: e instanceof Error ? e.message : "Failed to list models",
      },
      { status: 502 },
    );
  }
};

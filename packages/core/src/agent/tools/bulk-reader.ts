import type { LLMProvider, ProviderUsage } from "../provider.js";

const WORKER_SYSTEM = `You summarize source files for a coding agent.
Output ONLY structured bullets like:
- L12 [function] name
- L40 [class] Name
No preamble, no markdown fences, no full code. Prefer names and line numbers. Cap at 60 bullets.`;

export type BulkReadResult = { text: string; usage?: ProviderUsage };

/** Cheap worker pass — frontier never sees raw file body. Stateless. */
export async function summarizeBulkRead(
  provider: LLMProvider,
  model: string,
  opts: { path: string; content: string; signal?: AbortSignal; sessionId?: string },
): Promise<BulkReadResult> {
  const clipped = opts.content.length > 120_000 ? opts.content.slice(0, 120_000) + "\n…[truncated]" : opts.content;
  let text = "";
  let usage: ProviderUsage | undefined;
  for await (const ev of provider.chat(
    [
      { role: "system", content: WORKER_SYSTEM },
      {
        role: "user",
        content: `File: ${opts.path}\n\n\`\`\`\n${clipped}\n\`\`\``,
      },
    ],
    {
      model,
      temperature: 0.2,
      maxTokens: 1200,
      signal: opts.signal,
      sessionId: opts.sessionId,
    },
  )) {
    if (ev.type === "text.delta") text += ev.text;
    if (ev.type === "finish" && ev.usage) usage = ev.usage;
    if (ev.type === "error") throw new Error(ev.message);
  }
  const cleaned = text.trim();
  if (!cleaned) throw new Error("Worker returned empty outline");
  return { text: cleaned, usage };
}

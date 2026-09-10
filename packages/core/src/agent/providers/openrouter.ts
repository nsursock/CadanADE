import type { LLMProvider, ProviderChatOptions, ProviderEvent, ProviderMessage, ProviderUsage } from "../provider.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

type UsageChunk = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export class OpenRouterProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private opts: { siteUrl?: string; siteName?: string; baseUrl?: string } = {},
  ) {}

  private get base() {
    return (this.opts.baseUrl ?? OPENROUTER_BASE).replace(/\/$/, "");
  }

  async *chat(messages: ProviderMessage[], options: ProviderChatOptions): AsyncIterable<ProviderEvent> {
    if (!this.apiKey) {
      yield { type: "error", message: "Missing OPENROUTER_API_KEY" };
      return;
    }

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      tools: options.tools,
      stream: true,
      stream_options: { include_usage: true },
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    };
    if (options.sessionId) body.session_id = options.sessionId;

    const res = await fetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.opts.siteUrl ?? "http://localhost:5175",
        "X-Title": this.opts.siteName ?? "CadanADE",
        ...(options.sessionId ? { "x-session-id": options.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `OpenRouter ${res.status}: ${text.slice(0, 400)}` };
      return;
    }

    const headerGenId = res.headers.get("x-generation-id") ?? res.headers.get("X-Generation-Id") ?? undefined;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const toolArgs: Record<number, { id: string; name: string; args: string }> = {};
    let streamUsage: UsageChunk | undefined;
    let streamId: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          const usage = await this.resolveUsage(streamUsage, headerGenId ?? streamId);
          yield { type: "finish", finishReason: "stop", model: options.model, usage };
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const chunk = json as {
          id?: string;
          usage?: UsageChunk;
          choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string }>;
        };
        if (typeof chunk.id === "string" && chunk.id) streamId = chunk.id;
        if (chunk.usage) streamUsage = chunk.usage;

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};

        const reasoningDetails = delta.reasoning_details as unknown[] | undefined;
        let reasoningText = "";
        // Prefer the top-level `reasoning`/`reasoning_content` strings — they
        // carry the clean concatenated reasoning text. The structured
        // `reasoning_details` array often contains per-token segments that
        // produce one-token-per-line output when concatenated, and some models
        // mirror the same content in both fields (summing both doubles every
        // token). Use exactly one source in priority order; fall back to
        // `reasoning_details` only when the top-level strings are absent.
        if (typeof delta.reasoning === "string" && delta.reasoning) {
          reasoningText += delta.reasoning;
        } else if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          reasoningText += delta.reasoning_content;
        } else if (Array.isArray(reasoningDetails)) {
          for (const detail of reasoningDetails) {
            if (!detail || typeof detail !== "object") continue;
            const d = detail as { type?: string; text?: string; summary?: string };
            if (typeof d.text === "string" && d.text) reasoningText += d.text;
            else if (typeof d.summary === "string" && d.summary) reasoningText += d.summary;
          }
        }
        if (reasoningText || (Array.isArray(reasoningDetails) && reasoningDetails.length)) {
          // Some models stream reasoning as one-token-per-line via
          // reasoning_details (each segment carries trailing whitespace/newlines).
          // The UI renders reasoning with whitespace-pre-wrap, so those newlines
          // become visible line breaks and adjacent spaces double up. Collapse
          // all whitespace runs to a single space so reasoning flows as prose.
          if (reasoningText) reasoningText = reasoningText.replace(/\s+/g, " ");
          yield {
            type: "reasoning.delta",
            text: reasoningText,
            details: Array.isArray(reasoningDetails) ? reasoningDetails : undefined,
          };
        }

        if (typeof delta.content === "string" && delta.content) {
          yield { type: "text.delta", text: delta.content };
        }
        const toolCalls = delta.tool_calls as
          | Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
          | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const slot = (toolArgs[tc.index] ??= { id: "", name: "", args: "" });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) {
              slot.name = tc.function.name;
              yield { type: "tool_call.start", toolCallId: slot.id, toolName: slot.name, index: tc.index };
            }
            if (tc.function?.arguments) {
              slot.args += tc.function.arguments;
              yield { type: "tool_call.args.delta", index: tc.index, delta: tc.function.arguments };
            }
          }
        }
        if (choice.finish_reason) {
          for (const [index, slot] of Object.entries(toolArgs)) {
            if (!slot.id) continue;
            yield {
              type: "tool_call.complete",
              index: Number(index),
              toolCallId: slot.id,
              toolName: slot.name,
              arguments: slot.args,
            };
          }
          // Prefer usage chunk that often arrives after finish_reason; keep collecting until DONE.
          if (!streamUsage) {
            /* wait for usage/[DONE] */
          }
        }
      }
    }

    const usage = await this.resolveUsage(streamUsage, headerGenId ?? streamId);
    yield { type: "finish", finishReason: "stop", model: options.model, usage };
  }

  private async resolveUsage(streamUsage: UsageChunk | undefined, generationId?: string): Promise<ProviderUsage | undefined> {
    const fromStream: ProviderUsage | undefined = streamUsage
      ? {
          promptTokens: streamUsage.prompt_tokens ?? 0,
          completionTokens: streamUsage.completion_tokens ?? 0,
          totalTokens: streamUsage.total_tokens ?? (streamUsage.prompt_tokens ?? 0) + (streamUsage.completion_tokens ?? 0),
          costUsd: typeof streamUsage.cost === "number" ? streamUsage.cost : undefined,
          generationId,
        }
      : generationId
        ? { promptTokens: 0, completionTokens: 0, totalTokens: 0, generationId }
        : undefined;

    if (!fromStream) return undefined;
    if (fromStream.costUsd != null || !generationId) return fromStream;

    try {
      const cost = await this.fetchGenerationCost(generationId);
      if (cost != null) fromStream.costUsd = cost;
    } catch {
      /* ignore — tokens alone are still useful */
    }
    return fromStream;
  }

  private async fetchGenerationCost(id: string): Promise<number | null> {
    const res = await fetch(`${this.base}/generation?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { total_cost?: number; usage?: number } };
    const cost = json.data?.total_cost ?? json.data?.usage;
    return typeof cost === "number" ? cost : null;
  }
}

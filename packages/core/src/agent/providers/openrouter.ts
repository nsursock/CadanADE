import type { LLMProvider, ProviderChatOptions, ProviderEvent, ProviderMessage } from "../provider.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private opts: { siteUrl?: string; siteName?: string; baseUrl?: string } = {},
  ) {}

  async *chat(messages: ProviderMessage[], options: ProviderChatOptions): AsyncIterable<ProviderEvent> {
    if (!this.apiKey) {
      yield { type: "error", message: "Missing OPENROUTER_API_KEY" };
      return;
    }

    const body = {
      model: options.model,
      messages,
      tools: options.tools,
      stream: true,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    };

    const res = await fetch(`${this.opts.baseUrl ?? OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.opts.siteUrl ?? "http://localhost:5175",
        "X-Title": this.opts.siteName ?? "CadanADE",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `OpenRouter ${res.status}: ${text.slice(0, 400)}` };
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const toolArgs: Record<number, { id: string; name: string; args: string }> = {};

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
          yield { type: "finish", finishReason: "stop", model: options.model };
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = (json as { choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string }> })
          .choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
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
          yield { type: "finish", finishReason: choice.finish_reason, model: options.model };
          return;
        }
      }
    }
  }
}

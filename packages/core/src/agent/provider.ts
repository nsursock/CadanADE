export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderRole;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ProviderToolCall[];
  /** Plaintext reasoning for models that accept it on round-trip. */
  reasoning?: string;
  /** Full OpenRouter reasoning_details blocks — pass back unmodified for tool loops. */
  reasoning_details?: unknown[];
}

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ProviderTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD when OpenRouter reports it (stream usage.cost or /generation). */
  costUsd?: number;
  generationId?: string;
}

export interface ProviderChatOptions {
  model: string;
  tools?: ProviderTool[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** OpenRouter session_id — groups requests for Activity / Analytics A/B. */
  sessionId?: string;
}

export type ProviderEvent =
  | { type: "text.delta"; text: string }
  | { type: "reasoning.delta"; text: string; details?: unknown[] }
  | { type: "tool_call.start"; toolCallId: string; toolName: string; index: number }
  | { type: "tool_call.args.delta"; index: number; delta: string }
  | { type: "tool_call.complete"; index: number; toolCallId: string; toolName: string; arguments: string }
  | { type: "finish"; finishReason: string; model?: string; usage?: ProviderUsage }
  | { type: "error"; message: string };

export interface LLMProvider {
  chat(messages: ProviderMessage[], options: ProviderChatOptions): AsyncIterable<ProviderEvent>;
}

/** Stable OpenRouter session_id for Normal vs Thrift A/B (max 256 chars). */
export function openRouterSessionId(
  agentMode: string,
  localSessionId: string,
  role: "frontier" | "worker" = "frontier",
): string {
  const base = `cadan:${agentMode}:${localSessionId}`;
  const id = role === "worker" ? `${base}:worker` : base;
  return id.slice(0, 256);
}

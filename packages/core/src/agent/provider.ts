export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderRole;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ProviderToolCall[];
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

export interface ProviderChatOptions {
  model: string;
  tools?: ProviderTool[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "text.delta"; text: string }
  | { type: "tool_call.start"; toolCallId: string; toolName: string; index: number }
  | { type: "tool_call.args.delta"; index: number; delta: string }
  | { type: "tool_call.complete"; index: number; toolCallId: string; toolName: string; arguments: string }
  | { type: "finish"; finishReason: string; model?: string }
  | { type: "error"; message: string };

export interface LLMProvider {
  chat(messages: ProviderMessage[], options: ProviderChatOptions): AsyncIterable<ProviderEvent>;
}

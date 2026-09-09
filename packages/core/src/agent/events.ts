export type AgentEventType =
  | "text.delta"
  | "reasoning.delta"
  | "status"
  | "tool.start"
  | "tool.args"
  | "tool.result"
  | "tool.error"
  | "tool.approval_required"
  | "done"
  | "error"
  | "cancelled";

export interface AgentEvent {
  type: AgentEventType;
  sessionId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export function agentEvent(
  type: AgentEventType,
  sessionId: string,
  data?: Record<string, unknown>,
): AgentEvent {
  return { type, sessionId, timestamp: Date.now(), data };
}

export function encodeSSE(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

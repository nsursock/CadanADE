export const THEME_IDS = [
  "retrowave",
  "ghibli",
  "vibrantFiesta",
  "dawn",
  "synthwave84",
  "solarizedDark",
  "cottonCandy",
  "goldenTwilight",
  "brightContrasts",
  "cantinaGirl",
  "cyberpunk",
  "steampunk",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "retrowave";

export type AppMode = "editor" | "agent" | "stats" | "monitoring";

export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
}

export interface OpenTab {
  path: string;
  content: string;
  hash: string;
  dirty: boolean;
  /** Last saved (or opened) content — used to highlight unsaved edits. */
  savedContent: string;
}

/** Agent edit awaiting Accept / Reject review. */
export interface PendingChange {
  path: string;
  kind: "edit" | "create";
  /** Content before the agent change (empty for create). */
  baseline: string;
  baselineHash: string;
  afterHash: string;
  sessionId: string;
}

/** SSE payload without full baseline body (client may GET listPending). */
export type PendingChangeMeta = Omit<PendingChange, "baseline">;

export interface ToolCallCard {
  id: string;
  name: string;
  args?: unknown;
  result?: string;
  error?: string;
  status: "pending" | "running" | "done" | "error" | "approval";
}

/** Ordered stream segments so reasoning / text / tools stay in arrival order. */
export type ChatPart =
  | { kind: "reasoning"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; tool: ToolCallCard };

/** UI preference: verbose shows reasoning parts; compact hides them. */
export type ChatDisplayMode = "verbose" | "compact";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  /** Flattened assistant text (kept for compatibility / empty-state checks). */
  content: string;
  at: number;
  /** Sequential parts for assistant turns; preferred over content+tools. */
  parts?: ChatPart[];
  /** @deprecated Prefer parts; still updated for older consumers. */
  tools?: ToolCallCard[];
}

export interface FilePayload {
  path: string;
  content: string;
  hash: string;
}

/** Token usage for a single turn. */
export interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  agentMode: string;
  finishReason?: string;
  maxTokens?: number;
  /** Configured model id (e.g. openrouter/free). */
  model?: string;
  /** Actual model OpenRouter served. */
  routedModel?: string;
}

/** Cumulative token usage for a chat session. */
export interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  turns: number;
}

/** Harness verdict for the turn — the agent's own completion claim is not evidence. */
export interface Verification {
  verdict: "pass" | "deviations" | "fail";
  summary: string;
  report: string;
  blockers: number;
  warnings: number;
  ledgerPath: string;
}

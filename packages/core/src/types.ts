export const THEME_IDS = [
  "retrowave",
  "ghibli",
  "fiesta",
  "dawn",
  "synthwave84",
  "solarizedDark",
  "cottonCandy",
  "goldenTwilight",
  "brightContrasts",
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
}

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

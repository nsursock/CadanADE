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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at: number;
  tools?: ToolCallCard[];
}

export interface FilePayload {
  path: string;
  content: string;
  hash: string;
}

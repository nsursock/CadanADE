/** Browser-safe exports only — no node: modules. */
export type {
  ThemeId,
  AppMode,
  TreeNode,
  OpenTab,
  PendingChange,
  PendingChangeMeta,
  ChatMessage,
  ChatPart,
  ChatDisplayMode,
  FilePayload,
  ToolCallCard,
  SessionUsage,
  TurnUsage,
  Verification,
} from "./types.js";
export { THEME_IDS, DEFAULT_THEME } from "./types.js";
export { isImagePath, imageMimeType, extnameLower } from "./media.js";
export { PendingChangeStore } from "./services/pending-changes.js";

export { ThemeModel } from "./models/theme-model.js";
export { WorkspaceModel } from "./models/workspace-model.js";
export { EditorModel } from "./models/editor-model.js";
export { ChatModel } from "./models/chat-model.js";

export { ThemeController } from "./controllers/theme-controller.js";
export { ChatController } from "./controllers/chat-controller.js";

export type { AgentEvent, AgentEventType } from "./agent/events.js";

export type { OutlineBullet } from "./agent/tools/outline.js";
export { buildFileOutline, formatOutlineBullets } from "./agent/tools/outline.js";

export type { CadanSettings, AgentMode } from "./settings/index.js";
export {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  mergeSettings,
  clampMaxTokens,
  clampPromptBudgetTokens,
  loadSettings,
  saveSettings,
  patchSettings,
  AGENT_MODES,
  CHAT_DISPLAY_MODES,
} from "./settings/index.js";

export {
  appendReasoning,
  appendReasoningText,
  collapseReasoningWhitespace,
  normalizeTextDelta,
  type ReasoningAppend,
} from "./agent/reasoning-text.js";

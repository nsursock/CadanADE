/** Node / SvelteKit server-only entry — FS, crypto, workspace I/O. */
export {
  THEME_IDS,
  DEFAULT_THEME,
  ThemeModel,
  WorkspaceModel,
  EditorModel,
  ChatModel,
  ThemeController,
  ChatController,
} from "./index.js";
export type {
  ThemeId,
  AppMode,
  TreeNode,
  OpenTab,
  PendingChange,
  PendingChangeMeta,
  ChatMessage,
  FilePayload,
} from "./index.js";

export { WorkspaceController } from "./controllers/workspace-controller.js";
export { EditorController } from "./controllers/editor-controller.js";
export { WorkspaceService } from "./services/workspace-service.js";
export { PendingChangeStore } from "./services/pending-changes.js";
export { HistoryService } from "./services/history-service.js";
export type {
  HistoryReason,
  HistorySnapshotOpts,
  HistorySnapshotResult,
  HistoryEntry,
} from "./services/history-service.js";
export {
  listCandidateRoots,
  defaultProjectParent,
  createProjectDir,
} from "./services/workspace-discovery.js";

export {
  AgentEngine,
  AgentSession,
  OpenRouterProvider,
  encodeSSE,
  openRouterSessionId,
  TOOL_SCHEMAS,
  APPROVAL_REQUIRED,
} from "./agent/index.js";
export type { AgentEvent, AgentEventType, LLMProvider, ProviderMessage, ProviderUsage } from "./agent/index.js";

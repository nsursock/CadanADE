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
export type { ThemeId, AppMode, TreeNode, OpenTab, ChatMessage, FilePayload } from "./index.js";

export { WorkspaceController } from "./controllers/workspace-controller.js";
export { EditorController } from "./controllers/editor-controller.js";
export { WorkspaceService } from "./services/workspace-service.js";
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
export type { AgentEvent, AgentEventType, LLMProvider, ProviderUsage } from "./agent/index.js";

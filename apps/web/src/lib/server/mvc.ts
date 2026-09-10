import {
  ChatController,
  ChatModel,
  EditorController,
  EditorModel,
  ThemeController,
  ThemeModel,
  WorkspaceController,
  WorkspaceModel,
  WorkspaceService,
} from "@cadan/core/server";
import { createAgentRuntime } from "./agent-runtime";

const workspaceService = new WorkspaceService();

export const themeModel = new ThemeModel();
export const workspaceModel = new WorkspaceModel();
export const editorModel = new EditorModel();

/** Per-agent-session UI mirrors (keyed by AgentSession.id). */
const chatModels = new Map<string, ChatModel>();

export function getChatModel(sessionId: string): ChatModel {
  let model = chatModels.get(sessionId);
  if (!model) {
    model = new ChatModel();
    chatModels.set(sessionId, model);
  }
  return model;
}

export function deleteChatModel(sessionId: string) {
  chatModels.delete(sessionId);
}

export function clearChatModels() {
  chatModels.clear();
}

/** @deprecated Prefer getChatModel(sessionId). Kept for ChatController wiring. */
export const chatModel = new ChatModel();

export const themeController = new ThemeController(themeModel);
export const workspaceController = new WorkspaceController(workspaceModel, workspaceService);
export const editorController = new EditorController(editorModel, workspaceService);
export const chatController = new ChatController(chatModel);
export const agentRuntime = createAgentRuntime(workspaceService);
export { workspaceService };

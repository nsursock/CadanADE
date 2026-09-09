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
export const chatModel = new ChatModel();

export const themeController = new ThemeController(themeModel);
export const workspaceController = new WorkspaceController(workspaceModel, workspaceService);
export const editorController = new EditorController(editorModel, workspaceService);
export const chatController = new ChatController(chatModel);
export const agentRuntime = createAgentRuntime(workspaceService);

import type { ChatModel } from "../models/chat-model.js";

/** Thin client-facing chat helpers; agent turns run via AgentEngine on the server. */
export class ChatController {
  constructor(private model: ChatModel) {}

  clear() {
    this.model.clear();
  }
}

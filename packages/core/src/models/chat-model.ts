import type { ChatMessage, ToolCallCard } from "../types.js";

let seq = 0;

export class ChatModel {
  messages: ChatMessage[] = [];
  streaming = false;
  status: string | null = null;
  pendingApproval: { toolCallId: string; toolName: string; args: unknown } | null = null;

  add(role: ChatMessage["role"], content: string): ChatMessage {
    const msg: ChatMessage = {
      id: `m-${Date.now()}-${++seq}`,
      role,
      content,
      at: Date.now(),
      tools: role === "assistant" ? [] : undefined,
    };
    this.messages = [...this.messages, msg];
    return msg;
  }

  lastAssistant(): ChatMessage | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]!.role === "assistant") return this.messages[i]!;
    }
    return null;
  }

  appendText(text: string) {
    const msg = this.lastAssistant();
    if (!msg) return;
    msg.content += text;
    this.messages = [...this.messages];
  }

  upsertTool(card: ToolCallCard) {
    let msg = this.lastAssistant();
    if (!msg) msg = this.add("assistant", "");
    msg.tools ??= [];
    const idx = msg.tools.findIndex((t) => t.id === card.id);
    if (idx >= 0) msg.tools[idx] = { ...msg.tools[idx], ...card };
    else msg.tools.push(card);
    this.messages = [...this.messages];
  }

  setStreaming(v: boolean) {
    this.streaming = v;
  }

  setStatus(s: string | null) {
    this.status = s;
  }

  setPendingApproval(v: ChatModel["pendingApproval"]) {
    this.pendingApproval = v;
  }

  clear() {
    this.messages = [];
    this.streaming = false;
    this.status = null;
    this.pendingApproval = null;
  }
}

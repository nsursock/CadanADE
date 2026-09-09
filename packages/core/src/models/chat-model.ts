import type { ChatMessage, ChatPart, ToolCallCard } from "../types.js";

let seq = 0;
let partSeq = 0;

function nextPartId(kind: string) {
  return `${kind}-${Date.now()}-${++partSeq}`;
}

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
      parts: role === "assistant" ? [] : undefined,
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

  private syncContent(msg: ChatMessage) {
    msg.content = (msg.parts ?? [])
      .filter((p): p is Extract<ChatPart, { kind: "text" }> => p.kind === "text")
      .map((p) => p.text)
      .join("");
    msg.tools = (msg.parts ?? [])
      .filter((p): p is Extract<ChatPart, { kind: "tool" }> => p.kind === "tool")
      .map((p) => p.tool);
  }

  appendReasoning(text: string) {
    const msg = this.lastAssistant();
    if (!msg || !text) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "reasoning") last.text += text;
    else msg.parts.push({ kind: "reasoning", id: nextPartId("r"), text });
    this.messages = [...this.messages];
  }

  appendText(text: string) {
    const msg = this.lastAssistant();
    if (!msg || !text) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "text") last.text += text;
    else msg.parts.push({ kind: "text", id: nextPartId("t"), text });
    this.syncContent(msg);
    this.messages = [...this.messages];
  }

  upsertTool(card: ToolCallCard) {
    let msg = this.lastAssistant();
    if (!msg) msg = this.add("assistant", "");
    msg.parts ??= [];
    const existing = msg.parts.find((p) => p.kind === "tool" && p.tool.id === card.id);
    if (existing && existing.kind === "tool") {
      existing.tool = { ...existing.tool, ...card };
    } else {
      msg.parts.push({ kind: "tool", id: nextPartId("tool"), tool: card });
    }
    this.syncContent(msg);
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

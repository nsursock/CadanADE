import type { ChatDisplayMode, ChatMessage, ChatPart, OpenTab, ThemeId, TreeNode, ToolCallCard } from "@cadan/core";

export type SessionUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  turns: number;
};

export type TurnUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  agentMode: string;
};

export type ChatSessionTab = {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
  /** Agent runtime session id (same as id once created on server). */
  sessionId: string | null;
  streaming: boolean;
  status: string | null;
  pendingApproval: { toolCallId: string; toolName: string; args: unknown } | null;
  openRouterSessionId: string | null;
  turnUsage: TurnUsage | null;
  sessionUsage: SessionUsage;
};

export type TerminalSessionTab = {
  id: string;
  label: string;
  alive: boolean;
};

function emptyUsage(): SessionUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, turns: 0 };
}

function makeChatTab(sessionId: string, index: number): ChatSessionTab {
  return {
    id: sessionId,
    title: `Chat ${index}`,
    messages: [],
    draft: "",
    sessionId,
    streaming: false,
    status: null,
    pendingApproval: null,
    openRouterSessionId: null,
    turnUsage: null,
    sessionUsage: emptyUsage(),
  };
}

class AppState {
  themeId = $state<ThemeId>("retrowave");
  threeBackground = $state(false);
  perfLite = $state(false);

  workspaceRoot = $state<string | null>(null);
  tree = $state<TreeNode[]>([]);
  treeLoading = $state(false);
  workspaceError = $state<string | null>(null);

  tabs = $state<OpenTab[]>([]);
  activePath = $state<string | null>(null);

  chatSessions = $state<ChatSessionTab[]>([]);
  activeChatId = $state<string | null>(null);
  chatDisplayMode = $state<ChatDisplayMode>("compact");

  terminalSessions = $state<TerminalSessionTab[]>([]);
  activeTerminalId = $state<string | null>(null);
  private terminalSeq = 0;

  toast = $state<{ text: string; variant: string } | null>(null);
  settingsOpen = $state(false);
  fileClipboard = $state<{ path: string; operation: "cut" | "copy" } | null>(null);
  selectedModelId = $state("openrouter/free");
  workerModelId = $state("openrouter/free");
  agentMode = $state<"normal" | "thrift">("normal");
  hasProviderKey = $state(false);

  get activeTab(): OpenTab | null {
    return this.tabs.find((t) => t.path === this.activePath) ?? null;
  }

  get activeChat(): ChatSessionTab | null {
    return this.chatSessions.find((c) => c.id === this.activeChatId) ?? null;
  }

  /** Active-session mirrors used by StatusBar and ChatView. */
  get messages() {
    return this.activeChat?.messages ?? [];
  }
  get chatStreaming() {
    return this.activeChat?.streaming ?? false;
  }
  get chatStatus() {
    return this.activeChat?.status ?? null;
  }
  get sessionId() {
    return this.activeChat?.sessionId ?? null;
  }
  get pendingApproval() {
    return this.activeChat?.pendingApproval ?? null;
  }
  get openRouterSessionId() {
    return this.activeChat?.openRouterSessionId ?? null;
  }
  get turnUsage() {
    return this.activeChat?.turnUsage ?? null;
  }
  get sessionUsage() {
    return this.activeChat?.sessionUsage ?? emptyUsage();
  }

  showToast(text: string, variant = "info") {
    this.toast = { text, variant };
    setTimeout(() => {
      if (this.toast?.text === text) this.toast = null;
    }, 2800);
  }

  chatById(id: string | null | undefined): ChatSessionTab | null {
    if (!id) return null;
    return this.chatSessions.find((c) => c.id === id || c.sessionId === id) ?? null;
  }

  bumpChats() {
    this.chatSessions = [...this.chatSessions];
  }

  setActiveChat(id: string) {
    if (this.chatSessions.some((c) => c.id === id)) this.activeChatId = id;
  }

  addChatSession(sessionId: string) {
    const tab = makeChatTab(sessionId, this.chatSessions.length + 1);
    this.chatSessions = [...this.chatSessions, tab];
    this.activeChatId = tab.id;
    return tab;
  }

  removeChatSession(id: string) {
    const idx = this.chatSessions.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = this.chatSessions.filter((c) => c.id !== id);
    this.chatSessions = next;
    if (this.activeChatId === id) {
      this.activeChatId = next[Math.min(idx, next.length - 1)]?.id ?? null;
    }
  }

  clearChatSessions() {
    this.chatSessions = [];
    this.activeChatId = null;
  }

  get activeTerminal(): TerminalSessionTab | null {
    return this.terminalSessions.find((t) => t.id === this.activeTerminalId) ?? null;
  }

  ensureTerminalSession() {
    if (this.terminalSessions.length > 0) return;
    this.addTerminalSession();
  }

  addTerminalSession() {
    this.terminalSeq += 1;
    const tab: TerminalSessionTab = {
      id: `ui-term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: `Terminal ${this.terminalSeq}`,
      alive: false,
    };
    this.terminalSessions = [...this.terminalSessions, tab];
    this.activeTerminalId = tab.id;
    return tab;
  }

  setActiveTerminal(id: string) {
    if (this.terminalSessions.some((t) => t.id === id)) this.activeTerminalId = id;
  }

  /** Same pattern as removeChatSession — drop tab and move active if needed. */
  removeTerminalSession(id: string) {
    const idx = this.terminalSessions.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = this.terminalSessions.filter((t) => t.id !== id);
    this.terminalSessions = next;
    if (this.activeTerminalId === id) {
      this.activeTerminalId = next[Math.min(idx, next.length - 1)]?.id ?? null;
    }
  }

  clearTerminalSessions() {
    this.terminalSessions = [];
    this.activeTerminalId = null;
    this.terminalSeq = 0;
  }

  setTerminalAlive(id: string, alive: boolean) {
    const tab = this.terminalSessions.find((t) => t.id === id);
    if (!tab || tab.alive === alive) return;
    tab.alive = alive;
    this.terminalSessions = [...this.terminalSessions];
  }

  setChatMessages(sessionKey: string, messages: ChatMessage[]) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    chat.messages = messages;
    this.bumpChats();
  }

  setChatDraft(sessionKey: string, draft: string) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    chat.draft = draft;
  }

  setChatStreaming(sessionKey: string, streaming: boolean, status: string | null = null) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    chat.streaming = streaming;
    chat.status = status;
    this.bumpChats();
  }

  setChatPendingApproval(
    sessionKey: string,
    pending: ChatSessionTab["pendingApproval"],
  ) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    chat.pendingApproval = pending;
    this.bumpChats();
  }

  maybeTitleFromUserText(sessionKey: string, text: string) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    if (chat.messages.some((m) => m.role === "user")) return;
    const trimmed = text.trim().replace(/\s+/g, " ");
    if (!trimmed) return;
    chat.title = trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
  }

  applyUsage(sessionKey: string, data: Record<string, unknown> | undefined) {
    const chat = this.chatById(sessionKey);
    if (!chat || !data) return;
    const promptTokens = Number(data.promptTokens ?? 0);
    const completionTokens = Number(data.completionTokens ?? 0);
    const totalTokens = Number(data.totalTokens ?? promptTokens + completionTokens);
    const costUsd = Number(data.costUsd ?? 0);
    const agentMode = String(data.agentMode ?? this.agentMode);
    if (typeof data.openRouterSessionId === "string") {
      chat.openRouterSessionId = data.openRouterSessionId;
    }
    chat.turnUsage = { promptTokens, completionTokens, totalTokens, costUsd, agentMode };
    chat.sessionUsage = {
      promptTokens: chat.sessionUsage.promptTokens + promptTokens,
      completionTokens: chat.sessionUsage.completionTokens + completionTokens,
      totalTokens: chat.sessionUsage.totalTokens + totalTokens,
      costUsd: chat.sessionUsage.costUsd + costUsd,
      turns: chat.sessionUsage.turns + 1,
    };
    this.bumpChats();
  }

  resetUsage(sessionKey?: string) {
    const chat = sessionKey ? this.chatById(sessionKey) : this.activeChat;
    if (!chat) return;
    chat.turnUsage = null;
    chat.openRouterSessionId = null;
    chat.sessionUsage = emptyUsage();
    this.bumpChats();
  }

  private lastAssistant(chat: ChatSessionTab): ChatMessage | null {
    return [...chat.messages].reverse().find((m) => m.role === "assistant") ?? null;
  }

  private syncMessageDerived(msg: ChatMessage) {
    msg.content = (msg.parts ?? [])
      .filter((p): p is Extract<ChatPart, { kind: "text" }> => p.kind === "text")
      .map((p) => p.text)
      .join("");
    msg.tools = (msg.parts ?? [])
      .filter((p): p is Extract<ChatPart, { kind: "tool" }> => p.kind === "tool")
      .map((p) => p.tool);
  }

  appendReasoning(sessionKey: string, text: string) {
    const chat = this.chatById(sessionKey);
    if (!chat || !text) return;
    const msg = this.lastAssistant(chat);
    if (!msg) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "reasoning") last.text += text;
    else msg.parts.push({ kind: "reasoning", id: `r-${Date.now()}-${msg.parts.length}`, text });
    this.bumpChats();
  }

  appendText(sessionKey: string, text: string) {
    const chat = this.chatById(sessionKey);
    if (!chat || !text) return;
    const msg = this.lastAssistant(chat);
    if (!msg) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "text") last.text += text;
    else msg.parts.push({ kind: "text", id: `t-${Date.now()}-${msg.parts.length}`, text });
    this.syncMessageDerived(msg);
    this.bumpChats();
  }

  upsertTool(sessionKey: string, card: ToolCallCard) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    const msg = this.lastAssistant(chat);
    if (!msg) return;
    msg.parts ??= [];
    const existing = msg.parts.find((p) => p.kind === "tool" && p.tool.id === card.id);
    if (existing && existing.kind === "tool") {
      existing.tool = { ...existing.tool, ...card };
    } else {
      msg.parts.push({ kind: "tool", id: `tool-${Date.now()}-${msg.parts.length}`, tool: card });
    }
    this.syncMessageDerived(msg);
    this.bumpChats();
  }
}

export const appState = new AppState();

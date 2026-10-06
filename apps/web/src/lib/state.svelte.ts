import type {
  ChatDisplayMode,
  ChatMessage,
  ChatPart,
  OpenTab,
  PendingChange,
  ThemeId,
  TreeNode,
  ToolCallCard,
  SessionUsage,
  TurnUsage,
  Verification,
} from "@cadan/core";
import { appendReasoning, normalizeTextDelta, DEFAULT_SETTINGS } from "@cadan/core";

export type ToastVariant = "info" | "success" | "warning" | "error";

export type ToastItem = {
  id: number;
  text: string;
  variant: ToastVariant;
};

/** How long a notification stays when auto dismiss is on. */
const TOAST_MS = 2800;
/** Newest kept on screen; older ones are dropped rather than covering the UI. */
const MAX_TOASTS = 4;

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
  /** Why the last turn stopped (iteration budget, truncation, repeat guard, …). */
  turnNote: string | null;
  verification: Verification | null;
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
    turnNote: null,
    verification: null,
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
  /** Agent edits awaiting Accept / Reject. */
  pendingChanges = $state<PendingChange[]>([]);

  chatSessions = $state<ChatSessionTab[]>([]);
  activeChatId = $state<string | null>(null);
  chatDisplayMode = $state<ChatDisplayMode>("compact");

  terminalSessions = $state<TerminalSessionTab[]>([]);
  activeTerminalId = $state<string | null>(null);
  private terminalSeq = 0;

  toasts = $state<ToastItem[]>([]);
  /** Off: notifications stay until dismissed. */
  toastAutoDismiss = $state(DEFAULT_SETTINGS.toastAutoDismiss);
  private toastSeq = 0;
  private toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
  settingsOpen = $state(false);
  fileClipboard = $state<{ path: string; operation: "cut" | "copy" } | null>(null);
  /** Files added to chat context from outside ChatView (e.g. file browser context menu). */
  chatContextFiles = $state<string[]>([]);
  selectedModelId = $state("openrouter/free");
  workerModelId = $state("openrouter/free");
  agentMode = $state<"normal" | "thrift">("normal");
  hasProviderKey = $state(false);
  /** Request editor scroll/focus to 1-based line (consumed by EditorView). */
  scrollToLine = $state<number | null>(null);
  /** Bump to refresh timeline after save/accept. */
  historyEpoch = $state(0);
  /** Bump when tab content must be forced into CodeMirror (e.g. timeline restore). */
  editorDocNonce = $state(0);
  /** Imperative bridge so EditorView can apply content without relying on $effect timing. */
  private editorSetDoc: ((path: string, content: string) => void) | null = null;

  get activeTab(): OpenTab | null {
    return this.tabs.find((t) => t.path === this.activePath) ?? null;
  }

  get activePending(): PendingChange | null {
    if (!this.activePath) return null;
    return this.pendingChanges.find((p) => p.path === this.activePath) ?? null;
  }

  setPendingChanges(pending: PendingChange[]) {
    this.pendingChanges = pending;
  }

  upsertPendingChange(change: PendingChange) {
    const rest = this.pendingChanges.filter((p) => p.path !== change.path);
    this.pendingChanges = [...rest, change];
  }

  removePendingChange(path: string) {
    this.pendingChanges = this.pendingChanges.filter((p) => p.path !== path);
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

  showToast(text: string, variant: ToastVariant = "info") {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = ++this.toastSeq;
    // Newest first, bounded so a burst of failures can't cover the workspace.
    const overflow = this.toasts.slice(0, MAX_TOASTS - 1);
    for (const dropped of overflow) this.clearToastTimer(dropped.id);
    this.toasts = [{ id, text: trimmed, variant }, ...overflow];
    if (!this.toastAutoDismiss) return;
    this.toastTimers.set(
      id,
      setTimeout(() => {
        this.dismissToast(id);
      }, TOAST_MS),
    );
  }

  dismissToast(id: number) {
    this.clearToastTimer(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  clearToasts() {
    for (const timer of this.toastTimers.values()) clearTimeout(timer);
    this.toastTimers.clear();
    this.toasts = [];
  }

  /** Turning auto-dismiss off freezes whatever is already on screen. */
  setToastAutoDismiss(on: boolean) {
    this.toastAutoDismiss = on;
    if (on) return;
    for (const timer of this.toastTimers.values()) clearTimeout(timer);
    this.toastTimers.clear();
  }

  private clearToastTimer(id: number) {
    const timer = this.toastTimers.get(id);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(id);
  }

  requestScrollToLine(line: number) {
    this.scrollToLine = line;
  }

  bumpHistory() {
    this.historyEpoch += 1;
  }

  /** Replace open-tab content and force the editor to adopt it. */
  applyTabContent(path: string, content: string, opts?: { dirty?: boolean; hash?: string; resetSaved?: boolean }) {
    const dirty = opts?.dirty ?? true;
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) {
      existing.content = content;
      existing.dirty = dirty;
      if (opts?.hash != null) existing.hash = opts.hash;
      if (opts?.resetSaved || !dirty) existing.savedContent = content;
      this.tabs = [...this.tabs];
    } else {
      this.tabs = [
        ...this.tabs,
        { path, content, hash: opts?.hash ?? "", dirty, savedContent: content },
      ];
    }
    this.activePath = path;
    this.editorDocNonce += 1;
    // Apply immediately to the live CodeMirror instance (effect sync can race / no-op).
    this.editorSetDoc?.(path, content);
  }

  bindEditorSetDoc(fn: ((path: string, content: string) => void) | null) {
    this.editorSetDoc = fn;
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
    if (streaming) {
      chat.turnNote = null;
      chat.verification = null;
    }
    this.bumpChats();
  }

  /** Persist the agent's stop reason so the UI can explain why the turn ended. */
  setChatTurnNote(sessionKey: string, note: string | null) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    const cleaned = note?.trim();
    chat.turnNote = cleaned ? cleaned : null;
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

  /** Harness verdict + report for the turn that just finished. */
  setChatVerification(sessionKey: string, data: Record<string, unknown> | undefined) {
    const chat = this.chatById(sessionKey);
    if (!chat || !data) return;
    const verdict = data.verdict;
    if (verdict !== "pass" && verdict !== "deviations" && verdict !== "fail") return;
    chat.verification = {
      verdict,
      summary: String(data.summary ?? ""),
      report: String(data.report ?? ""),
      blockers: Number(data.blockers ?? 0),
      warnings: Number(data.warnings ?? 0),
      ledgerPath: String(data.ledgerPath ?? ""),
    };
    this.bumpChats();
  }

  setChatTitle(sessionKey: string, title: string) {
    const chat = this.chatById(sessionKey);
    if (!chat) return;
    const cleaned = title.trim().replace(/\s+/g, " ");
    if (!cleaned) return;
    chat.title = cleaned;
    this.bumpChats();
  }

  applyUsage(sessionKey: string, data: Record<string, unknown> | undefined) {
    const chat = this.chatById(sessionKey);
    if (!chat || !data) return;
    const promptTokens = Number(data.promptTokens ?? 0);
    const completionTokens = Number(data.completionTokens ?? 0);
    const totalTokens = Number(data.totalTokens ?? promptTokens + completionTokens);
    const costUsd = Number(data.costUsd ?? 0);
    const agentMode = String(data.agentMode ?? this.agentMode);
    const finishReason = typeof data.finishReason === "string" ? data.finishReason : undefined;
    const maxTokens = typeof data.maxTokens === "number" ? data.maxTokens : undefined;
    const model = typeof data.model === "string" ? data.model : undefined;
    const routedModel = typeof data.routedModel === "string" ? data.routedModel : undefined;
    if (typeof data.openRouterSessionId === "string") {
      chat.openRouterSessionId = data.openRouterSessionId;
    }
    chat.turnUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      agentMode,
      finishReason,
      maxTokens,
      model,
      routedModel,
    };
    chat.sessionUsage = {
      promptTokens: chat.sessionUsage.promptTokens + promptTokens,
      completionTokens: chat.sessionUsage.completionTokens + completionTokens,
      totalTokens: chat.sessionUsage.totalTokens + totalTokens,
      costUsd: chat.sessionUsage.costUsd + costUsd,
      turns: chat.sessionUsage.turns + 1,
    };
    if (finishReason === "length") {
      this.showToast("Output hit max tokens — raise Max tokens or use smaller edits", "warning");
    }
    this.bumpChats();
  }

  resetUsage(sessionKey?: string) {
    const chat = sessionKey ? this.chatById(sessionKey) : this.activeChat;
    if (!chat) return;
    chat.turnUsage = null;
    chat.openRouterSessionId = null;
    chat.turnNote = null;
    chat.verification = null;
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
    const append = last?.kind === "reasoning" ? appendReasoning(last.text, text) : appendReasoning("", text);
    // Whitespace-only deltas normalize to nothing — don't re-render for them.
    if (!append.text) return;
    if (last?.kind === "reasoning") last.text = append.text;
    else msg.parts.push({ kind: "reasoning", id: `r-${Date.now()}-${msg.parts.length}`, text: append.text });
    this.bumpChats();
  }

  appendText(sessionKey: string, text: string) {
    const chat = this.chatById(sessionKey);
    if (!chat || !text) return;
    const msg = this.lastAssistant(chat);
    if (!msg) return;
    // Cap whitespace floods so a model streaming space/newline tokens freely
    // can't bury the sentence it is actually saying.
    const delta = normalizeTextDelta(text);
    if (!delta.trim()) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "text") last.text = normalizeTextDelta(last.text + delta);
    else msg.parts.push({ kind: "text", id: `t-${Date.now()}-${msg.parts.length}`, text: delta });
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

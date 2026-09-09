import type { ChatDisplayMode, ChatMessage, ChatPart, OpenTab, ThemeId, TreeNode, ToolCallCard } from "@cadan/core";

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

  messages = $state<ChatMessage[]>([]);
  chatStreaming = $state(false);
  chatStatus = $state<string | null>(null);
  sessionId = $state<string | null>(null);
  pendingApproval = $state<{ toolCallId: string; toolName: string; args: unknown } | null>(null);
  chatDisplayMode = $state<ChatDisplayMode>("compact");

  toast = $state<{ text: string; variant: string } | null>(null);
  settingsOpen = $state(false);
  fileClipboard = $state<{ path: string; operation: "cut" | "copy" } | null>(null);
  selectedModelId = $state("openrouter/free");
  workerModelId = $state("openrouter/free");
  agentMode = $state<"normal" | "thrift">("normal");
  hasProviderKey = $state(false);

  /** OpenRouter A/B accounting for the active chat session. */
  openRouterSessionId = $state<string | null>(null);
  turnUsage = $state<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    agentMode: string;
  } | null>(null);
  sessionUsage = $state({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    turns: 0,
  });

  get activeTab(): OpenTab | null {
    return this.tabs.find((t) => t.path === this.activePath) ?? null;
  }

  showToast(text: string, variant = "info") {
    this.toast = { text, variant };
    setTimeout(() => {
      if (this.toast?.text === text) this.toast = null;
    }, 2800);
  }

  applyUsage(data: Record<string, unknown> | undefined) {
    if (!data) return;
    const promptTokens = Number(data.promptTokens ?? 0);
    const completionTokens = Number(data.completionTokens ?? 0);
    const totalTokens = Number(data.totalTokens ?? promptTokens + completionTokens);
    const costUsd = Number(data.costUsd ?? 0);
    const agentMode = String(data.agentMode ?? this.agentMode);
    if (typeof data.openRouterSessionId === "string") {
      this.openRouterSessionId = data.openRouterSessionId;
    }
    this.turnUsage = { promptTokens, completionTokens, totalTokens, costUsd, agentMode };
    this.sessionUsage = {
      promptTokens: this.sessionUsage.promptTokens + promptTokens,
      completionTokens: this.sessionUsage.completionTokens + completionTokens,
      totalTokens: this.sessionUsage.totalTokens + totalTokens,
      costUsd: this.sessionUsage.costUsd + costUsd,
      turns: this.sessionUsage.turns + 1,
    };
  }

  resetUsage() {
    this.turnUsage = null;
    this.openRouterSessionId = null;
    this.sessionUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      turns: 0,
    };
  }

  private lastAssistant(): ChatMessage | null {
    return [...this.messages].reverse().find((m) => m.role === "assistant") ?? null;
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

  private bumpMessages() {
    this.messages = [...this.messages];
  }

  appendReasoning(text: string) {
    const msg = this.lastAssistant();
    if (!msg || !text) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "reasoning") last.text += text;
    else msg.parts.push({ kind: "reasoning", id: `r-${Date.now()}-${msg.parts.length}`, text });
    this.bumpMessages();
  }

  appendText(text: string) {
    const msg = this.lastAssistant();
    if (!msg || !text) return;
    msg.parts ??= [];
    const last = msg.parts[msg.parts.length - 1];
    if (last?.kind === "text") last.text += text;
    else msg.parts.push({ kind: "text", id: `t-${Date.now()}-${msg.parts.length}`, text });
    this.syncMessageDerived(msg);
    this.bumpMessages();
  }

  upsertTool(card: ToolCallCard) {
    const msg = this.lastAssistant();
    if (!msg) return;
    msg.parts ??= [];
    const existing = msg.parts.find((p) => p.kind === "tool" && p.tool.id === card.id);
    if (existing && existing.kind === "tool") {
      existing.tool = { ...existing.tool, ...card };
    } else {
      msg.parts.push({ kind: "tool", id: `tool-${Date.now()}-${msg.parts.length}`, tool: card });
    }
    this.syncMessageDerived(msg);
    this.bumpMessages();
  }
}

export const appState = new AppState();

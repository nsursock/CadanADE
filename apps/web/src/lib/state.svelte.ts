import type { ChatMessage, OpenTab, ThemeId, TreeNode, ToolCallCard } from "@cadan/core";

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

  toast = $state<{ text: string; variant: string } | null>(null);
  settingsOpen = $state(false);
  selectedModelId = $state("openrouter/free");
  hasProviderKey = $state(false);

  get activeTab(): OpenTab | null {
    return this.tabs.find((t) => t.path === this.activePath) ?? null;
  }

  showToast(text: string, variant = "info") {
    this.toast = { text, variant };
    setTimeout(() => {
      if (this.toast?.text === text) this.toast = null;
    }, 2800);
  }

  upsertTool(card: ToolCallCard) {
    const msg = [...this.messages].reverse().find((m) => m.role === "assistant");
    if (!msg) return;
    msg.tools ??= [];
    const idx = msg.tools.findIndex((t) => t.id === card.id);
    if (idx >= 0) msg.tools[idx] = { ...msg.tools[idx], ...card };
    else msg.tools.push(card);
    this.messages = [...this.messages];
  }
}

export const appState = new AppState();

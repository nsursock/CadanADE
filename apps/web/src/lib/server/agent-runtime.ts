import {
  AgentEngine,
  AgentSession,
  OpenRouterProvider,
  encodeSSE,
  type AgentEvent,
  type WorkspaceService,
} from "@cadan/core/server";
import { getProviderConfig } from "./provider-config";

export function createAgentRuntime(workspace: WorkspaceService) {
  const sessions = new Map<string, AgentSession>();
  let activeId: string | null = null;

  function getOrCreateSession() {
    if (activeId && sessions.has(activeId)) return sessions.get(activeId)!;
    const session = new AgentSession();
    sessions.set(session.id, session);
    activeId = session.id;
    return session;
  }

  function provider() {
    const cfg = getProviderConfig();
    return new OpenRouterProvider(cfg.apiKey, {
      siteName: "CadanADE",
      baseUrl: cfg.baseUrl,
    });
  }

  return {
    getSession: getOrCreateSession,
    getSessionById(id: string) {
      return sessions.get(id) ?? null;
    },
    async runTurn(root: string, text: string, onEvent: (ev: AgentEvent) => void) {
      const session = getOrCreateSession();
      const cfg = getProviderConfig();
      const engine = new AgentEngine({
        provider: provider(),
        workspace,
        root,
        model: cfg.model,
        emit: onEvent,
      });
      await engine.run(session, text);
      return session;
    },
    approve(sessionId: string, toolCallId: string, approved: boolean) {
      const session = sessions.get(sessionId);
      if (!session) return false;
      return session.resolveApproval(toolCallId, approved);
    },
    cancel(sessionId?: string) {
      const session = sessionId ? sessions.get(sessionId) : activeId ? sessions.get(activeId) : null;
      session?.cancel();
    },
    encodeSSE,
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;

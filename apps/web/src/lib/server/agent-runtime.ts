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
    getActiveId() {
      return activeId;
    },
    listSessions() {
      return [...sessions.keys()];
    },
    createSession() {
      const session = new AgentSession();
      sessions.set(session.id, session);
      activeId = session.id;
      return session;
    },
    setActive(id: string) {
      if (!sessions.has(id)) return false;
      activeId = id;
      return true;
    },
    deleteSession(id: string) {
      const session = sessions.get(id);
      if (!session) return false;
      session.cancel();
      sessions.delete(id);
      if (activeId === id) {
        activeId = sessions.keys().next().value ?? null;
      }
      return true;
    },
    /** Fresh AgentSession so OpenRouter session_id tags stay comparable across A/B arms. */
    resetSession(sessionId?: string) {
      const target = sessionId ?? activeId;
      if (target) {
        sessions.get(target)?.cancel();
        sessions.delete(target);
      }
      const session = new AgentSession();
      sessions.set(session.id, session);
      activeId = session.id;
      return session;
    },
    async runTurn(
      root: string,
      text: string,
      onEvent: (ev: AgentEvent) => void,
      sessionId?: string,
    ) {
      let session: AgentSession;
      if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) throw new Error(`Unknown chat session: ${sessionId}`);
        session = existing;
        activeId = session.id;
      } else {
        session = getOrCreateSession();
      }
      const cfg = getProviderConfig();
      const llm = provider();
      const engine = new AgentEngine({
        provider: llm,
        workspace,
        root,
        model: cfg.model,
        agentMode: cfg.agentMode,
        worker:
          cfg.agentMode === "thrift" && cfg.workerModel
            ? { provider: llm, model: cfg.workerModel }
            : undefined,
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

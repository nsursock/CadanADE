import {
  AgentEngine,
  AgentSession,
  OpenRouterProvider,
  encodeSSE,
  type AgentEvent,
  type ProviderMessage,
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
    /** Cheap one-shot LLM call to summarize a conversation into a 2-3 word title. */
    async generateTitle(sessionId: string, userText: string): Promise<string | null> {
      const cfg = getProviderConfig();
      if (!cfg.apiKey) return null;
      const llm = provider();
      const system =
        "You generate a 2-3 word title that describes what the user is asking about. " +
        "Rules: exactly 2 or 3 words, no punctuation, no quotes, no articles (a/an/the), " +
        "no filler (here's, this is, the user wants), no complete sentences. " +
        "Output ONLY the title words, nothing else.";
      const examples: ProviderMessage[] = [
        { role: "user", content: "What's this project about?" },
        { role: "assistant", content: "Project Overview" },
        { role: "user", content: "Fix the bug where the login button doesn't work" },
        { role: "assistant", content: "Fix Login Button" },
        { role: "user", content: "Can you add a dark mode toggle to the settings page?" },
        { role: "assistant", content: "Add Dark Mode" },
        { role: "user", content: "Refactor the database connection pooling code" },
        { role: "assistant", content: "Refactor DB Pooling" },
      ];
      let title = "";
      let reasoning = "";
      try {
        for await (const ev of llm.chat(
          [
            { role: "system", content: system },
            ...examples,
            { role: "user", content: userText.slice(0, 500) },
          ],
          { model: cfg.model, temperature: 0.2, maxTokens: 20 },
        )) {
          if (ev.type === "text.delta") title += ev.text;
          else if (ev.type === "reasoning.delta") reasoning += ev.text;
          else if (ev.type === "error") {
            console.error("[generateTitle] LLM error:", ev.message);
            return null;
          }
        }
      } catch (e) {
        console.error("[generateTitle] exception:", e instanceof Error ? e.message : e);
        return null;
      }
      // Some free models put the answer in reasoning, not content
      const raw = title.trim() || reasoning.trim();
      if (!raw) {
        console.error("[generateTitle] empty response (title=%j reasoning=%j)", title, reasoning);
        return null;
      }
      const cleaned = raw
        .replace(/^["']|["']$/g, "")
        .replace(/[.!?]$/g, "")
        .replace(/^(here'?s|this is|the user wants|user wants)\s+/i, "")
        .split(/\s+/)
        .filter((w) => !/^(a|an|the)$/i.test(w))
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      console.log("[generateTitle] generated:", cleaned, "from raw:", raw);
      return cleaned || null;
    },
    encodeSSE,
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;

import type { RequestHandler } from "./$types";
import {
  agentRuntime,
  clearChatModels,
  deleteChatModel,
  getChatModel,
  workspaceModel,
} from "$lib/server/mvc";
import type { AgentEvent } from "@cadan/core/server";
import { hasProviderKey } from "$lib/server/provider-config";

export const GET: RequestHandler = async () => {
  const activeId = agentRuntime.getActiveId();
  const model = activeId ? getChatModel(activeId) : null;
  return Response.json({
    sessions: agentRuntime.listSessions().map((id) => ({
      sessionId: id,
      streaming: getChatModel(id).streaming,
    })),
    activeId,
    messages: model?.messages ?? [],
    streaming: model?.streaming ?? false,
    status: model?.status ?? null,
    pendingApproval: model?.pendingApproval ?? null,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  if (body.action === "create") {
    const session = agentRuntime.createSession();
    getChatModel(session.id);
    return Response.json({ ok: true, sessionId: session.id });
  }

  if (body.action === "list") {
    return Response.json({
      ok: true,
      sessions: agentRuntime.listSessions(),
      activeId: agentRuntime.getActiveId(),
    });
  }

  if (body.action === "switch") {
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId || !agentRuntime.setActive(sessionId)) {
      return Response.json({ error: "Unknown session" }, { status: 404 });
    }
    return Response.json({ ok: true, sessionId });
  }

  if (body.action === "delete") {
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
    agentRuntime.deleteSession(sessionId);
    deleteChatModel(sessionId);
    return Response.json({ ok: true, activeId: agentRuntime.getActiveId() });
  }

  if (body.action === "clear") {
    const sessionId = String(body.sessionId ?? agentRuntime.getActiveId() ?? "");
    if (sessionId) getChatModel(sessionId).clear();
    return Response.json({ ok: true });
  }

  if (body.action === "reset") {
    const prev = body.sessionId ? String(body.sessionId) : undefined;
    if (prev) deleteChatModel(prev);
    else clearChatModels();
    const session = agentRuntime.resetSession(prev);
    getChatModel(session.id);
    return Response.json({ ok: true, sessionId: session.id });
  }

  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "Empty message" }, { status: 400 });

  const root = workspaceModel.root;
  if (!root) return Response.json({ error: "Open a workspace first" }, { status: 400 });

  if (!hasProviderKey()) {
    return Response.json(
      { error: "Add an OpenRouter API key in Settings (or set OPENROUTER_API_KEY)" },
      { status: 400 },
    );
  }

  let sessionId = body.sessionId ? String(body.sessionId) : undefined;
  if (sessionId && !agentRuntime.getSessionById(sessionId)) {
    return Response.json({ error: "Unknown chat session" }, { status: 404 });
  }
  if (!sessionId) {
    sessionId = agentRuntime.getSession().id;
  }

  const chatModel = getChatModel(sessionId);
  const isFirstInteraction = !chatModel.messages.some((m) => m.role === "user");
  chatModel.add("user", text);
  chatModel.add("assistant", "");
  chatModel.setStreaming(true);
  chatModel.setPendingApproval(null);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (ev: AgentEvent) => {
        applyLocal(ev);
        controller.enqueue(enc.encode(agentRuntime.encodeSSE(ev)));
      };

      try {
        if (isFirstInteraction && sessionId) {
          const title = await agentRuntime.generateTitle(sessionId, text);
          console.log("[chat] title result:", title, "for session:", sessionId);
          if (title) {
            send({
              type: "title",
              sessionId: sessionId ?? "unknown",
              timestamp: Date.now(),
              data: { title },
            });
          }
        }
        await agentRuntime.runTurn(root, text, send, sessionId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send({
          type: "error",
          sessionId: sessionId ?? "unknown",
          timestamp: Date.now(),
          data: { message },
        });
      } finally {
        chatModel.setStreaming(false);
        chatModel.setStatus(null);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

function applyLocal(ev: AgentEvent) {
  const chatModel = getChatModel(ev.sessionId);
  switch (ev.type) {
    case "text.delta":
      chatModel.appendText(String(ev.data?.text ?? ""));
      break;
    case "reasoning.delta":
      chatModel.appendReasoning(String(ev.data?.text ?? ""));
      break;
    case "status":
      chatModel.setStatus(String(ev.data?.message ?? ""));
      break;
    case "tool.start":
      chatModel.upsertTool({
        id: String(ev.data?.toolCallId),
        name: String(ev.data?.toolName),
        status: "running",
      });
      break;
    case "tool.args":
      chatModel.upsertTool({
        id: String(ev.data?.toolCallId),
        name: String(ev.data?.toolName),
        args: ev.data?.args,
        status: "running",
      });
      break;
    case "tool.result":
      chatModel.upsertTool({
        id: String(ev.data?.toolCallId),
        name: String(ev.data?.toolName),
        result: String(ev.data?.result ?? ""),
        status: "done",
      });
      chatModel.setPendingApproval(null);
      break;
    case "tool.error":
      chatModel.upsertTool({
        id: String(ev.data?.toolCallId),
        name: String(ev.data?.toolName),
        error: String(ev.data?.error ?? ""),
        status: "error",
      });
      chatModel.setPendingApproval(null);
      break;
    case "tool.approval_required":
      chatModel.upsertTool({
        id: String(ev.data?.toolCallId),
        name: String(ev.data?.toolName),
        args: ev.data?.args,
        status: "approval",
      });
      chatModel.setPendingApproval({
        toolCallId: String(ev.data?.toolCallId),
        toolName: String(ev.data?.toolName),
        args: ev.data?.args,
      });
      break;
    case "done":
    case "error":
    case "cancelled":
      chatModel.setStreaming(false);
      chatModel.setStatus(null);
      break;
  }
}

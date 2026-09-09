import type { RequestHandler } from "./$types";
import { agentRuntime, chatModel, workspaceModel } from "$lib/server/mvc";
import type { AgentEvent } from "@cadan/core/server";
import { hasProviderKey } from "$lib/server/provider-config";

export const GET: RequestHandler = async () => {
  return Response.json({
    messages: chatModel.messages,
    streaming: chatModel.streaming,
    status: chatModel.status,
    pendingApproval: chatModel.pendingApproval,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  if (body.action === "clear") {
    chatModel.clear();
    return Response.json({ ok: true });
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
        await agentRuntime.runTurn(root, text, send);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send({
          type: "error",
          sessionId: "unknown",
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
  switch (ev.type) {
    case "text.delta":
      chatModel.appendText(String(ev.data?.text ?? ""));
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

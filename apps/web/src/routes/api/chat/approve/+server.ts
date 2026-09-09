import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { agentRuntime } from "$lib/server/mvc";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const sessionId = String(body.sessionId ?? "");
  const toolCallId = String(body.toolCallId ?? "");
  const approved = Boolean(body.approved);
  const ok = agentRuntime.approve(sessionId, toolCallId, approved);
  if (!ok) return json({ error: "No pending approval" }, { status: 404 });
  return json({ ok: true });
};

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { historyService, workspaceModel } from "$lib/server/mvc";

export const GET: RequestHandler = async ({ url }) => {
  const root = workspaceModel.root;
  if (!root) return json({ error: "No workspace open" }, { status: 400 });
  const path = url.searchParams.get("path") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "40");
  const entries = await historyService.list(root, {
    path: path || undefined,
    limit: Number.isFinite(limit) ? limit : 40,
  });
  return json({ entries });
};

export const POST: RequestHandler = async ({ request }) => {
  const root = workspaceModel.root;
  if (!root) return json({ error: "No workspace open" }, { status: 400 });
  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "readAt") {
      const hash = String(body.hash ?? "");
      const path = String(body.path ?? "");
      if (!hash || !path) return json({ error: "hash and path required" }, { status: 400 });
      const result = await historyService.readAt(root, hash, path);
      if ("error" in result) return json({ error: result.error }, { status: 404 });
      return json({ path, hash, content: result.content });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "History error" }, { status: 500 });
  }
};

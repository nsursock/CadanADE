import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { editorController, editorModel, workspaceModel } from "$lib/server/mvc";

export const GET: RequestHandler = async () => {
  return json({
    tabs: editorModel.tabs,
    activePath: editorModel.activePath,
    pending: editorController.listPending(),
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const action = body.action as string;
  const root = workspaceModel.root;
  if (!root && action !== "close" && action !== "activate" && action !== "listPending") {
    return json({ error: "No workspace open" }, { status: 400 });
  }

  try {
    if (action === "open") {
      const file = await editorController.openFile(root!, String(body.path));
      return json(file);
    }
    if (action === "save") {
      const path = String(body.path);
      if (typeof body.content === "string") {
        editorController.edit(path, body.content);
      }
      const saved = await editorController.save(root!, path);
      if (saved.history && !saved.history.ok && (saved.history.reason === "no-git" || saved.history.reason === "error")) {
        return json({ ...saved, historyWarning: saved.history.message });
      }
      return json(saved);
    }
    if (action === "edit") {
      editorController.edit(String(body.path), String(body.content ?? ""));
      return json({ ok: true });
    }
    if (action === "close") {
      editorController.close(String(body.path));
      return json({ tabs: editorModel.tabs, activePath: editorModel.activePath });
    }
    if (action === "activate") {
      editorController.activate(String(body.path));
      return json({ activePath: editorModel.activePath });
    }
    if (action === "listPending") {
      const sessionId = body.sessionId != null ? String(body.sessionId) : undefined;
      return json({ pending: editorController.listPending(sessionId) });
    }
    if (action === "accept") {
      const result = await editorController.accept(root!, String(body.path));
      return json({
        ...result,
        pending: editorController.listPending(),
        tabs: editorModel.tabs,
        activePath: editorModel.activePath,
      });
    }
    if (action === "reject") {
      const result = await editorController.reject(root!, String(body.path));
      return json({
        ...result,
        pending: editorController.listPending(),
        tabs: editorModel.tabs,
        activePath: editorModel.activePath,
      });
    }
    if (action === "acceptAll") {
      const sessionId = body.sessionId != null ? String(body.sessionId) : undefined;
      const result = await editorController.acceptAll(root!, sessionId);
      return json({
        ...result,
        pending: editorController.listPending(),
        tabs: editorModel.tabs,
        activePath: editorModel.activePath,
      });
    }
    if (action === "rejectAll") {
      const sessionId = body.sessionId != null ? String(body.sessionId) : undefined;
      const result = await editorController.rejectAll(root!, sessionId);
      return json({
        ...result,
        pending: editorController.listPending(),
        tabs: editorModel.tabs,
        activePath: editorModel.activePath,
      });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Editor error" }, { status: 500 });
  }
};

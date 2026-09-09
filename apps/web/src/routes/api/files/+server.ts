import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { editorController, editorModel, workspaceModel } from "$lib/server/mvc";

export const GET: RequestHandler = async () => {
  return json({
    tabs: editorModel.tabs,
    activePath: editorModel.activePath,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const action = body.action as string;
  const root = workspaceModel.root;
  if (!root && action !== "close" && action !== "activate") {
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
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Editor error" }, { status: 500 });
  }
};

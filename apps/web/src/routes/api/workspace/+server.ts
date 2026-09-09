import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createProjectDir,
  defaultProjectParent,
  listCandidateRoots,
} from "@cadan/core/server";
import { addRecent, loadRecent } from "$lib/server/recent";
import { workspaceController, workspaceModel } from "$lib/server/mvc";

export const GET: RequestHandler = async () => {
  const [candidates, recent, defaultProjectDir] = await Promise.all([
    listCandidateRoots(),
    loadRecent(),
    defaultProjectParent(),
  ]);
  return json({
    root: workspaceModel.root,
    tree: workspaceModel.tree,
    candidates,
    recent,
    defaultProjectDir,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const action = body.action as string;

  if (action === "open") {
    const result = await workspaceController.open(String(body.path ?? ""));
    await addRecent(result.root);
    return json(result);
  }
  if (action === "refresh") {
    const tree = await workspaceController.refresh();
    return json({ root: workspaceModel.root, tree });
  }
  if (action === "close") {
    workspaceController.close();
    return json({ ok: true });
  }
  if (action === "create") {
    try {
      const created = await createProjectDir(String(body.name ?? ""), body.parentPath ? String(body.parentPath) : undefined);
      const result = await workspaceController.open(created.rootPath);
      await addRecent(result.root);
      return json({ ...result, name: created.name });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 400 });
    }
  }
  if (action === "discover") {
    const [candidates, recent, defaultProjectDir] = await Promise.all([
      listCandidateRoots(),
      loadRecent(),
      defaultProjectParent(),
    ]);
    return json({ candidates, recent, defaultProjectDir });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

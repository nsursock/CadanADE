import type { RequestHandler } from "./$types";
import { imageMimeType, isImagePath } from "@cadan/core";
import { workspaceModel, workspaceService } from "$lib/server/mvc";

export const GET: RequestHandler = async ({ url }) => {
  const root = workspaceModel.root;
  if (!root) {
    return new Response(JSON.stringify({ error: "No workspace open" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rel = url.searchParams.get("path");
  if (!rel) {
    return new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isImagePath(rel)) {
    return new Response(JSON.stringify({ error: "Not an image" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data } = await workspaceService.readBinaryFile(root, rel);
    const mime = imageMimeType(rel) ?? "application/octet-stream";
    return new Response(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Read failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

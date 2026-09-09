import type { WorkspaceService } from "../../services/workspace-service.js";

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: { root: string; workspace: WorkspaceService },
) => Promise<string>;

export function createToolHandlers(workspace: WorkspaceService): Record<string, ToolHandler> {
  return {
    async list_files(args, ctx) {
      const dir = String(args.dir ?? "");
      const tree = await workspace.listFlat(ctx.root, dir);
      return JSON.stringify(tree, null, 2);
    },
    async read_file(args, ctx) {
      const path = String(args.path ?? "");
      const file = await workspace.readFile(ctx.root, path);
      let content = file.content;
      const start = typeof args.startLine === "number" ? args.startLine : undefined;
      const end = typeof args.endLine === "number" ? args.endLine : undefined;
      if (start != null || end != null) {
        const lines = content.split("\n");
        const s = Math.max(1, start ?? 1) - 1;
        const e = Math.min(lines.length, end ?? lines.length);
        content = lines.slice(s, e).join("\n");
      }
      return JSON.stringify({ path: file.path, hash: file.hash, content });
    },
    async search_files(args, ctx) {
      const hits = await workspace.search(ctx.root, String(args.query ?? ""), args.glob ? String(args.glob) : undefined);
      return JSON.stringify(hits.slice(0, 80), null, 2);
    },
    async write_file(args, ctx) {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const expectedHash = args.expectedHash != null ? String(args.expectedHash) : undefined;
      const saved = await workspace.writeFile(ctx.root, path, content, expectedHash);
      return JSON.stringify({ path: saved.path, hash: saved.hash, bytes: content.length });
    },
    async create_file(args, ctx) {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const saved = await workspace.createFile(ctx.root, path, content);
      return JSON.stringify({ path: saved.path, hash: saved.hash });
    },
    async delete_file(args, ctx) {
      const path = String(args.path ?? "");
      await workspace.deleteFile(ctx.root, path);
      return JSON.stringify({ deleted: path });
    },
    async execute_command(args, ctx) {
      const command = String(args.command ?? "");
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 30_000;
      const result = await workspace.execute(ctx.root, command, timeoutMs);
      return JSON.stringify(result);
    },
  };
}

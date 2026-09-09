import type { WorkspaceService } from "../../services/workspace-service.js";
import type { AgentMode } from "../../settings/defaults.js";
import type { LLMProvider, ProviderUsage } from "../provider.js";
import { summarizeBulkRead } from "./bulk-reader.js";
import { buildFileOutline, formatOutlineBullets } from "./outline.js";

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

export interface ToolContext {
  root: string;
  workspace: WorkspaceService;
  agentMode?: AgentMode;
  readLineThreshold?: number;
  worker?: { provider: LLMProvider; model: string };
  workerSessionId?: string;
  signal?: AbortSignal;
  onUsage?: (usage: ProviderUsage, role: "frontier" | "worker") => void;
  /** Paths written/created this turn — thrift must not block re-reads of them. */
  writtenThisTurn?: Set<string>;
}

const DEFAULT_READ_THRESHOLD = Number(process.env.CADAN_READ_LINE_THRESHOLD) || 350;

export function normalizeToolPath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function createToolHandlers(): Record<string, ToolHandler> {
  return {
    async list_files(args, ctx) {
      const dir = String(args.dir ?? "");
      const tree = await ctx.workspace.listFlat(ctx.root, dir);
      return JSON.stringify(tree, null, 2);
    },
    async read_file(args, ctx) {
      const path = String(args.path ?? "");
      const file = await ctx.workspace.readFile(ctx.root, path);
      const start = typeof args.startLine === "number" ? args.startLine : undefined;
      const end = typeof args.endLine === "number" ? args.endLine : undefined;
      const hasRange = start != null || end != null;
      const allLines = file.content.split("\n");
      const threshold = ctx.readLineThreshold ?? DEFAULT_READ_THRESHOLD;
      const norm = normalizeToolPath(file.path);
      const writtenHere = ctx.writtenThisTurn?.has(norm) ?? false;

      if (
        ctx.agentMode === "thrift" &&
        !hasRange &&
        !writtenHere &&
        allLines.length > threshold
      ) {
        let outlineText = formatOutlineBullets(buildFileOutline(file.content));
        let workerUsed = false;
        if (ctx.worker?.model) {
          try {
            const bulk = await summarizeBulkRead(ctx.worker.provider, ctx.worker.model, {
              path: file.path,
              content: file.content,
              signal: ctx.signal,
              sessionId: ctx.workerSessionId,
            });
            outlineText = bulk.text;
            workerUsed = true;
            if (bulk.usage) ctx.onUsage?.(bulk.usage, "worker");
          } catch {
            /* keep deterministic outline */
          }
        }
        return JSON.stringify(
          {
            blocked: true,
            mode: "thrift",
            path: file.path,
            hash: file.hash,
            lineCount: allLines.length,
            threshold,
            workerUsed,
            outline: outlineText,
            hint: `Full content withheld (${allLines.length} lines > ${threshold}). Use startLine/endLine for a targeted slice, or search_files. Files you wrote this turn are never blocked.`,
          },
          null,
          2,
        );
      }

      let content = file.content;
      if (hasRange) {
        const s = Math.max(1, start ?? 1) - 1;
        const e = Math.min(allLines.length, end ?? allLines.length);
        content = allLines.slice(s, e).join("\n");
      }
      return JSON.stringify({
        path: file.path,
        hash: file.hash,
        content,
        ...(writtenHere && ctx.agentMode === "thrift" ? { thriftBypass: "written_this_turn" } : {}),
      });
    },
    async search_files(args, ctx) {
      const hits = await ctx.workspace.search(
        ctx.root,
        String(args.query ?? ""),
        args.glob ? String(args.glob) : undefined,
      );
      return JSON.stringify(hits.slice(0, 80), null, 2);
    },
    async write_file(args, ctx) {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const expectedHash = args.expectedHash != null ? String(args.expectedHash) : undefined;
      const saved = await ctx.workspace.writeFile(ctx.root, path, content, expectedHash);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      return JSON.stringify({ path: saved.path, hash: saved.hash, bytes: content.length });
    },
    async create_file(args, ctx) {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const saved = await ctx.workspace.createFile(ctx.root, path, content);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      return JSON.stringify({ path: saved.path, hash: saved.hash });
    },
    async edit_file(args, ctx) {
      const path = String(args.path ?? "");
      const oldString = String(args.oldString ?? "");
      const newString = String(args.newString ?? "");
      const expectedHash = args.expectedHash != null ? String(args.expectedHash) : undefined;
      const replaceAll = args.replaceAll === true;
      const saved = await ctx.workspace.editFile(ctx.root, path, oldString, newString, expectedHash, replaceAll);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      return JSON.stringify({
        path: saved.path,
        hash: saved.hash,
        bytes: saved.bytes,
        replacements: saved.replacements,
      });
    },
    async delete_file(args, ctx) {
      const path = String(args.path ?? "");
      await ctx.workspace.deleteFile(ctx.root, path);
      ctx.writtenThisTurn?.delete(normalizeToolPath(path));
      return JSON.stringify({ deleted: path });
    },
    async execute_command(args, ctx) {
      const command = String(args.command ?? "");
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 30_000;
      const result = await ctx.workspace.execute(ctx.root, command, timeoutMs);
      return JSON.stringify(result);
    },
  };
}

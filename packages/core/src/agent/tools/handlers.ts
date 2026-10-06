import type { PendingChange } from "../../types.js";
import type { PendingChangeStore } from "../../services/pending-changes.js";
import type { WorkspaceService } from "../../services/workspace-service.js";
import type { AgentMode } from "../../settings/defaults.js";
import { capCommandResult } from "../context-compact.js";
import type { LLMProvider, ProviderUsage } from "../provider.js";
import type { LedgerEvidence, LedgerHandle } from "../ledger/types.js";
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
  sessionId?: string;
  pendingChanges?: PendingChangeStore;
  onPendingChange?: (change: PendingChange) => void;
  /** Present only when this turn has a requirements ledger. */
  ledger?: LedgerHandle;
}

function trackPending(
  ctx: ToolContext,
  input: {
    path: string;
    kind: "edit" | "create";
    baseline: string;
    baselineHash: string;
    afterHash: string;
  },
) {
  if (!ctx.pendingChanges || !ctx.sessionId) return;
  const change = ctx.pendingChanges.register({
    path: input.path,
    kind: input.kind,
    baseline: input.baseline,
    baselineHash: input.baselineHash,
    afterHash: input.afterHash,
    sessionId: ctx.sessionId,
  });
  ctx.onPendingChange?.(change);
}

async function readBaseline(
  ctx: ToolContext,
  rel: string,
): Promise<{ kind: "edit" | "create"; baseline: string; baselineHash: string }> {
  try {
    const file = await ctx.workspace.readFile(ctx.root, rel);
    return { kind: "edit", baseline: file.content, baselineHash: file.hash };
  } catch {
    return { kind: "create", baseline: "", baselineHash: "" };
  }
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
      const before = await readBaseline(ctx, path);
      const saved = await ctx.workspace.writeFile(ctx.root, path, content, expectedHash);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      trackPending(ctx, {
        path: saved.path,
        kind: before.kind,
        baseline: before.baseline,
        baselineHash: before.baselineHash,
        afterHash: saved.hash,
      });
      return JSON.stringify({ path: saved.path, hash: saved.hash, bytes: content.length });
    },
    async create_file(args, ctx) {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      const saved = await ctx.workspace.createFile(ctx.root, path, content);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      trackPending(ctx, {
        path: saved.path,
        kind: "create",
        baseline: "",
        baselineHash: "",
        afterHash: saved.hash,
      });
      return JSON.stringify({ path: saved.path, hash: saved.hash });
    },
    async edit_file(args, ctx) {
      const path = String(args.path ?? "");
      const oldString = String(args.oldString ?? "");
      const newString = String(args.newString ?? "");
      const expectedHash = args.expectedHash != null ? String(args.expectedHash) : undefined;
      const replaceAll = args.replaceAll === true;
      const before = await readBaseline(ctx, path);
      const saved = await ctx.workspace.editFile(ctx.root, path, oldString, newString, expectedHash, replaceAll);
      ctx.writtenThisTurn?.add(normalizeToolPath(saved.path));
      trackPending(ctx, {
        path: saved.path,
        kind: "edit",
        baseline: before.baseline,
        baselineHash: before.baselineHash,
        afterHash: saved.hash,
      });
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
      return JSON.stringify(capCommandResult(result));
    },
    async update_ledger(args, ctx) {
      const ledger = ctx.ledger;
      if (!ledger) throw new Error("No requirements ledger for this turn — nothing to update.");
      const raw = args.evidence as { command?: unknown; quote?: unknown } | undefined;
      const evidence: LedgerEvidence | undefined =
        raw && typeof raw.quote === "string"
          ? { quote: raw.quote, ...(typeof raw.command === "string" ? { command: raw.command } : {}) }
          : undefined;
      const result = ledger.update({
        id: String(args.id ?? ""),
        status: args.status as "done" | "deviation" | "todo",
        ...(typeof args.note === "string" ? { note: args.note } : {}),
        ...(evidence ? { evidence } : {}),
      });
      if (!result.ok) return JSON.stringify({ ok: false, error: result.error });
      const item = result.item;
      return JSON.stringify({
        ok: true,
        id: item.id,
        status: item.status,
        requirement: item.text,
        check: item.check,
        ledger: ledger.ledger.items.map((i) => ({ id: i.id, status: i.status })),
      });
    },
    async web_search(args, ctx) {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const response = await fetch("https://api.duckduckgo.com/?q=" + encodeURIComponent(query) + "&format=json&pretty=1");
      if (!response.ok) {
        throw new Error(`Web search failed: ${response.status}`);
      }
      const data = await response.json();
      const results = data.RelatedTopics
        .filter((r: any) => r.FirstURL && r.Text)
        .slice(0, limit)
        .map((r: any) => ({
          title: r.Text.split(" - ")[0] ?? "Result",
          url: r.FirstURL,
          snippet: r.Text,
        }));
      return JSON.stringify({ query, results }, null, 2);
    },
    async web_fetch(args, ctx) {
      const url = String(args.url ?? "");
      const format = (args.format as "text" | "markdown" | "html") ?? "markdown";
      const timeout = typeof args.timeout === "number" ? Math.min(args.timeout, 120) : 30;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; CadanADE/0.1)" } });
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }
        let content = await response.text();
        if (format === "markdown") {
          // Simple HTML to markdown conversion for readability
          content = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 50000);
        }
        return JSON.stringify({ url, format, content }, null, 2);
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

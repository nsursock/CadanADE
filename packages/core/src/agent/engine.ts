import { agentEvent, type AgentEvent } from "./events.js";
import type { LLMProvider, ProviderMessage, ProviderToolCall, ProviderUsage } from "./provider.js";
import { openRouterSessionId } from "./provider.js";
import { AgentSession } from "./session.js";
import { APPROVAL_REQUIRED, TOOL_SCHEMAS } from "./tools/schema.js";
import { createToolHandlers } from "./tools/handlers.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { AgentMode } from "../settings/defaults.js";

const SYSTEM_NORMAL = `You are Cadan, an autonomous coding agent in a local workspace IDE.
If the workspace has an AGENTS.md file, read it at the start of a new conversation for workspace-specific guidance.
Use tools to inspect and edit files. Prefer small, correct changes.
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
If the workspace has a virtual environment (e.g. .venv/bin/python), use it for all Python commands — never bare \`python\`.
When the user mentions a file by name, search for it directly — do not list the workspace first. Prefer search_files over list_files for orientation; list_files returns every file including logs and build artifacts and can be very large. Use list_files only before creating a new file to match neighboring conventions.
Act on reasonable assumptions; do not ask clarifying questions unless blocked.
When done, briefly summarize what you changed.`;

const SYSTEM_THRIFT = `You are Cadan, an autonomous coding agent in a local workspace IDE (thrift mode).
If the workspace has an AGENTS.md file, read it at the start of a new conversation for workspace-specific guidance.
Use tools to inspect and edit files. Prefer small, correct changes.
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
If the workspace has a virtual environment (e.g. .venv/bin/python), use it for all Python commands — never bare \`python\`.
When the user mentions a file by name, search for it directly — do not list the workspace first. Prefer search_files over list_files for orientation; list_files returns every file including logs and build artifacts and can be very large. Use list_files only before creating a new file to match neighboring conventions.
Bulk file reads over the line threshold return an outline only — follow up with startLine/endLine or search_files for the slices you need. Do not ask for the full file body when an outline suffices.
Files you create or write in this turn are never blocked on re-read — you can read them back in full to validate.
Act on reasonable assumptions; do not ask clarifying questions unless blocked.
When done, briefly summarize what you changed.`;

const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";

/**
 * Detect degenerate reasoning loops — the same text block repeated 3+ times.
 * Uses a 200-char trailing fingerprint and substring search.
 */
function isReasoningLoop(text: string, fingerprintSize = 200, minTotal = 600): boolean {
  if (text.length < minTotal) return false;
  const fingerprint = text.slice(-fingerprintSize);
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(fingerprint, idx)) !== -1) {
    count++;
    idx += fingerprintSize;
  }
  return count >= 3;
}

export interface EngineOptions {
  provider: LLMProvider;
  workspace: WorkspaceService;
  root: string;
  model?: string;
  agentMode?: AgentMode;
  /** Cheap model for thrift bulk outlines; omit for deterministic-only outlines. */
  worker?: { provider: LLMProvider; model: string };
  readLineThreshold?: number;
  maxIterations?: number;
  /** Workspace-relative file paths to inject as context before the user message. */
  contextFiles?: string[];
  emit: (event: AgentEvent) => void;
}

function emptyUsage(): ProviderUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
}

function addUsage(into: ProviderUsage, u: ProviderUsage) {
  into.promptTokens += u.promptTokens;
  into.completionTokens += u.completionTokens;
  into.totalTokens += u.totalTokens;
  into.costUsd = (into.costUsd ?? 0) + (u.costUsd ?? 0);
}

export class AgentEngine {
  constructor(private opts: EngineOptions) {}

  async run(session: AgentSession, userText: string) {
    const { provider, workspace, root, emit } = this.opts;
    const model = this.opts.model ?? process.env.CADAN_MODEL ?? DEFAULT_MODEL;
    const agentMode: AgentMode = this.opts.agentMode ?? "normal";
    const maxIterations = this.opts.maxIterations ?? 10;
    const signal = session.beginTurn();
    const handlers = createToolHandlers();
    const system = agentMode === "thrift" ? SYSTEM_THRIFT : SYSTEM_NORMAL;
    const orSession = openRouterSessionId(agentMode, session.id, "frontier");
    const orWorkerSession = openRouterSessionId(agentMode, session.id, "worker");
    const turnUsage = emptyUsage();
    const generations: string[] = [];
    const writtenThisTurn = new Set<string>();
    let lastToolSignature = "";
    let toolRepeatCount = 0;

    const track = (u: ProviderUsage) => {
      addUsage(turnUsage, u);
      if (u.generationId) generations.push(u.generationId);
    };

    if (session.messages.length === 0) {
      session.messages.push({ role: "system", content: system });
    } else if (session.messages[0]?.role === "system") {
      session.messages[0] = { role: "system", content: system };
    }

    // Inject context files (active editor file + @-mentioned files) before the user message.
    if (this.opts.contextFiles?.length) {
      const blocks: string[] = [];
      for (const rel of this.opts.contextFiles) {
        try {
          const file = await workspace.readFile(root, rel);
          blocks.push(`<file path="${rel}">\n${file.content}\n</file>`);
        } catch {
          /* skip unreadable files */
        }
      }
      if (blocks.length) {
        session.messages.push({
          role: "system",
          content:
            `You already have the full contents of the following files — do NOT read them again with read_file or list_files. ` +
            `Reference them directly from the context below.\n\n${blocks.join("\n\n")}`,
        });
      }
    }

    session.messages.push({ role: "user", content: userText });

    const usagePayload = () => ({
      agentMode,
      openRouterSessionId: orSession,
      workerSessionId: agentMode === "thrift" ? orWorkerSession : undefined,
      promptTokens: turnUsage.promptTokens,
      completionTokens: turnUsage.completionTokens,
      totalTokens: turnUsage.totalTokens,
      costUsd: turnUsage.costUsd ?? 0,
      generations,
    });

    try {
      for (let i = 0; i < maxIterations; i++) {
        if (signal.aborted) {
          session.status = "cancelled";
          emit(agentEvent("cancelled", session.id, usagePayload()));
          return;
        }
        emit(
          agentEvent("status", session.id, {
            message: `Thinking…`,
            iteration: i + 1,
            model,
            agentMode,
            openRouterSessionId: orSession,
          }),
        );

        const toolCalls: ProviderToolCall[] = [];
        let assistantText = "";
        let reasoningText = "";
        const reasoningDetails: unknown[] = [];
        const argBuf: Record<number, { id: string; name: string; args: string }> = {};

        for await (const ev of provider.chat(session.messages, {
          model,
          tools: TOOL_SCHEMAS,
          signal,
          sessionId: orSession,
        })) {
          if (ev.type === "reasoning.delta") {
            if (ev.text) {
              reasoningText += ev.text;
              emit(agentEvent("reasoning.delta", session.id, { text: ev.text }));
              if (isReasoningLoop(reasoningText)) {
                emit(
                  agentEvent("status", session.id, {
                    message: "Reasoning loop detected — stopping generation",
                    iteration: i + 1,
                    model,
                    agentMode,
                  }),
                );
                break;
              }
            }
            if (ev.details?.length) reasoningDetails.push(...ev.details);
          } else if (ev.type === "text.delta") {
            assistantText += ev.text;
            emit(agentEvent("text.delta", session.id, { text: ev.text }));
          } else if (ev.type === "tool_call.start") {
            argBuf[ev.index] = { id: ev.toolCallId, name: ev.toolName, args: "" };
            emit(agentEvent("tool.start", session.id, { toolCallId: ev.toolCallId, toolName: ev.toolName }));
          } else if (ev.type === "tool_call.args.delta") {
            const slot = argBuf[ev.index];
            if (slot) slot.args += ev.delta;
          } else if (ev.type === "tool_call.complete") {
            argBuf[ev.index] = {
              id: ev.toolCallId,
              name: ev.toolName,
              args: ev.arguments,
            };
            let parsed: unknown = {};
            try {
              parsed = JSON.parse(ev.arguments || "{}");
            } catch {
              parsed = { raw: ev.arguments };
            }
            emit(
              agentEvent("tool.args", session.id, {
                toolCallId: ev.toolCallId,
                toolName: ev.toolName,
                args: parsed,
              }),
            );
          } else if (ev.type === "error") {
            session.status = "error";
            emit(agentEvent("error", session.id, { message: ev.message, ...usagePayload() }));
            return;
          } else if (ev.type === "finish") {
            if (ev.usage) track(ev.usage);
          }
        }

        // Flush pending tool calls — handles both normal finish and early break.
        for (const slot of Object.values(argBuf)) {
          if (!slot.id || !slot.name) continue;
          toolCalls.push({
            id: slot.id,
            type: "function",
            function: { name: slot.name, arguments: slot.args || "{}" },
          });
        }

        const assistantMsg: ProviderMessage = {
          role: "assistant",
          content: assistantText || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        };
        if (reasoningText) assistantMsg.reasoning = reasoningText;
        if (reasoningDetails.length) assistantMsg.reasoning_details = reasoningDetails;
        session.messages.push(assistantMsg);

        if (!toolCalls.length) {
          session.status = "done";
          emit(agentEvent("done", session.id, usagePayload()));
          return;
        }

        // Detect identical tool calls across consecutive iterations.
        const signature = toolCalls
          .map((tc) => `${tc.function.name}:${tc.function.arguments}`)
          .sort()
          .join("|");
        if (signature === lastToolSignature) {
          toolRepeatCount++;
          if (toolRepeatCount >= 2) {
            emit(
              agentEvent("status", session.id, {
                message: "Repetitive tool calls detected — stopping",
                iteration: i + 1,
                model,
                agentMode,
              }),
            );
            session.status = "done";
            emit(agentEvent("done", session.id, { message: "Repetitive tool calls", ...usagePayload() }));
            return;
          }
        } else {
          toolRepeatCount = 0;
        }
        lastToolSignature = signature;

        for (const call of toolCalls) {
          const name = call.function.name;
          const toolCallId = call.id;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }

          if (APPROVAL_REQUIRED.has(name)) {
            emit(agentEvent("tool.approval_required", session.id, { toolCallId, toolName: name, args }));
            const ok = await session.awaitApproval(toolCallId);
            if (!ok) {
              const msg = "Denied by user";
              emit(agentEvent("tool.error", session.id, { toolCallId, toolName: name, error: msg }));
              session.messages.push({ role: "tool", tool_call_id: toolCallId, content: msg });
              continue;
            }
          }

          const handler = handlers[name];
          if (!handler) {
            const msg = `Unknown tool: ${name}`;
            emit(agentEvent("tool.error", session.id, { toolCallId, toolName: name, error: msg }));
            session.messages.push({ role: "tool", tool_call_id: toolCallId, content: msg });
            continue;
          }

          try {
            emit(agentEvent("status", session.id, { message: `Running ${name}`, toolCallId, agentMode }));
            const result = await handler(args, {
              root,
              workspace,
              agentMode,
              worker: this.opts.worker,
              workerSessionId: orWorkerSession,
              readLineThreshold: this.opts.readLineThreshold,
              signal,
              onUsage: (u) => track(u),
              writtenThisTurn,
            });
            emit(agentEvent("tool.result", session.id, { toolCallId, toolName: name, result }));
            session.messages.push({ role: "tool", tool_call_id: toolCallId, content: result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            emit(agentEvent("tool.error", session.id, { toolCallId, toolName: name, error: msg }));
            session.messages.push({ role: "tool", tool_call_id: toolCallId, content: `Error: ${msg}` });
          }
        }
      }

      session.status = "done";
      emit(agentEvent("done", session.id, { message: "Iteration limit reached", ...usagePayload() }));
    } catch (e) {
      if (signal.aborted) {
        session.status = "cancelled";
        emit(agentEvent("cancelled", session.id, usagePayload()));
        return;
      }
      session.status = "error";
      emit(agentEvent("error", session.id, { message: e instanceof Error ? e.message : String(e), ...usagePayload() }));
    }
  }
}

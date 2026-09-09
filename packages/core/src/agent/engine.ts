import { agentEvent, type AgentEvent } from "./events.js";
import type { LLMProvider, ProviderMessage, ProviderToolCall, ProviderUsage } from "./provider.js";
import { openRouterSessionId } from "./provider.js";
import { AgentSession } from "./session.js";
import { APPROVAL_REQUIRED, TOOL_SCHEMAS } from "./tools/schema.js";
import { createToolHandlers } from "./tools/handlers.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { AgentMode } from "../settings/defaults.js";

const SYSTEM_NORMAL = `You are Cadan, an autonomous coding agent in a local workspace IDE.
Use tools to inspect and edit files. Prefer small, correct changes.
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
Act on reasonable assumptions; do not ask clarifying questions unless blocked.
When done, briefly summarize what you changed.`;

const SYSTEM_THRIFT = `You are Cadan, an autonomous coding agent in a local workspace IDE (thrift mode).
Use tools to inspect and edit files. Prefer small, correct changes.
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
Bulk file reads over the line threshold return an outline only — follow up with startLine/endLine or search_files for the slices you need. Do not ask for the full file body when an outline suffices.
Files you create or write in this turn are never blocked on re-read — you can read them back in full to validate.
Act on reasonable assumptions; do not ask clarifying questions unless blocked.
When done, briefly summarize what you changed.`;

const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";

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

    const track = (u: ProviderUsage) => {
      addUsage(turnUsage, u);
      if (u.generationId) generations.push(u.generationId);
    };

    if (session.messages.length === 0) {
      session.messages.push({ role: "system", content: system });
    } else if (session.messages[0]?.role === "system") {
      session.messages[0] = { role: "system", content: system };
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
            for (const slot of Object.values(argBuf)) {
              if (!slot.id || !slot.name) continue;
              toolCalls.push({
                id: slot.id,
                type: "function",
                function: { name: slot.name, arguments: slot.args || "{}" },
              });
            }
          }
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

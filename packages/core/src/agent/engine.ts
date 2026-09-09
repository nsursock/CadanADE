import { agentEvent, type AgentEvent } from "./events.js";
import type { LLMProvider, ProviderMessage, ProviderToolCall } from "./provider.js";
import { AgentSession } from "./session.js";
import { APPROVAL_REQUIRED, TOOL_SCHEMAS } from "./tools/schema.js";
import { createToolHandlers } from "./tools/handlers.js";
import type { WorkspaceService } from "../services/workspace-service.js";

const SYSTEM = `You are Cadan, an autonomous coding agent in a local workspace IDE.
Use tools to inspect and edit files. Prefer small, correct changes.
Act on reasonable assumptions; do not ask clarifying questions unless blocked.
When done, briefly summarize what you changed.`;

const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";

export interface EngineOptions {
  provider: LLMProvider;
  workspace: WorkspaceService;
  root: string;
  model?: string;
  maxIterations?: number;
  emit: (event: AgentEvent) => void;
}

export class AgentEngine {
  constructor(private opts: EngineOptions) {}

  async run(session: AgentSession, userText: string) {
    const { provider, workspace, root, emit } = this.opts;
    const model = this.opts.model ?? process.env.CADAN_MODEL ?? DEFAULT_MODEL;
    const maxIterations = this.opts.maxIterations ?? 10;
    const signal = session.beginTurn();
    const handlers = createToolHandlers(workspace);

    if (session.messages.length === 0) {
      session.messages.push({ role: "system", content: SYSTEM });
    }
    session.messages.push({ role: "user", content: userText });

    try {
      for (let i = 0; i < maxIterations; i++) {
        if (signal.aborted) {
          session.status = "cancelled";
          emit(agentEvent("cancelled", session.id));
          return;
        }
        emit(agentEvent("status", session.id, { message: `Thinking…`, iteration: i + 1, model }));

        const toolCalls: ProviderToolCall[] = [];
        let assistantText = "";
        const argBuf: Record<number, { id: string; name: string; args: string }> = {};

        for await (const ev of provider.chat(session.messages, {
          model,
          tools: TOOL_SCHEMAS,
          signal,
        })) {
          if (ev.type === "text.delta") {
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
            emit(agentEvent("error", session.id, { message: ev.message }));
            return;
          } else if (ev.type === "finish") {
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
        session.messages.push(assistantMsg);

        if (!toolCalls.length) {
          session.status = "done";
          emit(agentEvent("done", session.id));
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
            emit(agentEvent("status", session.id, { message: `Running ${name}`, toolCallId }));
            const result = await handler(args, { root, workspace });
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
      emit(agentEvent("done", session.id, { message: "Iteration limit reached" }));
    } catch (e) {
      if (signal.aborted) {
        session.status = "cancelled";
        emit(agentEvent("cancelled", session.id));
        return;
      }
      session.status = "error";
      emit(agentEvent("error", session.id, { message: e instanceof Error ? e.message : String(e) }));
    }
  }
}

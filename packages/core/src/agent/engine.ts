import { agentEvent, type AgentEvent } from "./events.js";
import {
  commandMatchesCheck,
  extractCheckCommands,
  parseCommandExitCode,
  parseExecutedCommand,
} from "./check-commands.js";
import { compactToolMessages } from "./context-compact.js";
import type { LLMProvider, ProviderMessage, ProviderToolCall, ProviderUsage } from "./provider.js";
import { openRouterSessionId } from "./provider.js";
import { AgentSession } from "./session.js";
import { APPROVAL_REQUIRED, TOOL_SCHEMAS } from "./tools/schema.js";
import { createToolHandlers } from "./tools/handlers.js";
import type { PendingChangeStore } from "../services/pending-changes.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { AgentMode } from "../settings/defaults.js";

const EDIT_BIAS = `Prefer edit_file for fixes; use write_file/create_file for new files or intentional full rewrites only — do not rewrite an entire file to fix one error.
When a command or test prints an error or shape mismatch, fix that specific issue next; do not ignore tool output.
Do not invent library APIs — inspect installed packages or use the simplest documented form.
If output was truncated (finish_reason=length), make a smaller change or ask to raise max tokens / start a fresh chat.`;

const SYSTEM_NORMAL = `You are Cadan, an autonomous coding agent in a local workspace IDE.
If the workspace has an AGENTS.md file, read it at the start of a new conversation for workspace-specific guidance.
Use tools to inspect and edit files. Prefer small, correct changes.
${EDIT_BIAS}
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
${EDIT_BIAS}
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

const LENGTH_NUDGE =
  "Your previous model response was truncated (finish_reason=length). Prefer edit_file for a minimal fix; avoid full-file rewrites; or ask the user to raise max tokens / start a fresh chat with less history.";

const CHECK_UNTIL_GREEN_NUDGE = (checks: string[], detail: string) =>
  `Verification not green yet (${detail}). Run these check command(s) with execute_command, fix failures with edit_file, and do not stop until every check exits 0:\n${checks.map((c) => `- ${c}`).join("\n")}`;

const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";
const MAX_CHECK_RETRIES = 5;

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
  /** Completion budget passed to the provider (default 4096). */
  maxTokens?: number;
  /** Keep this many recent tool results fully; older ones are stubbed. */
  keepRecentToolResults?: number;
  /** Workspace-relative file paths to inject as context before the user message. */
  contextFiles?: string[];
  pendingChanges?: PendingChangeStore;
  emit: (event: AgentEvent) => void;
}

const PROMPT_WARN_TOKENS = 20_000;
const PROMPT_HIGH_TOKENS = 40_000;

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
    const maxTokens = this.opts.maxTokens ?? 4096;
    const keepRecentToolResults = this.opts.keepRecentToolResults ?? 6;
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
    let lastFinishReason: string | undefined;
    let lastRoutedModel: string | undefined;
    const writePathCounts = new Map<string, number>();
    const checkCommands = extractCheckCommands(userText);
    /** Latest exit code per check command (undefined = never run). */
    const checkResults = new Map<string, number | null>();
    let checkRetries = 0;
    const maxIters = checkCommands.length
      ? Math.max(maxIterations, maxIterations + MAX_CHECK_RETRIES)
      : maxIterations;

    const track = (u: ProviderUsage) => {
      addUsage(turnUsage, u);
      if (u.generationId) generations.push(u.generationId);
      if (u.routedModel) lastRoutedModel = u.routedModel;
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

    if (checkCommands.length) {
      session.messages.push({
        role: "system",
        content:
          `Check-until-green: the user specified verification command(s). Keep fixing until each exits 0 before claiming success:\n` +
          checkCommands.map((c) => `- \`${c}\``).join("\n"),
      });
      emit(
        agentEvent("status", session.id, {
          message: `Check-until-green · ${checkCommands.length} command(s)`,
          checks: checkCommands,
          agentMode,
        }),
      );
    }

    const checksGreen = () =>
      checkCommands.length > 0 &&
      checkCommands.every((c) => {
        const code = checkResults.get(c);
        return typeof code === "number" && code === 0;
      });

    const checksPendingDetail = () => {
      const parts: string[] = [];
      for (const c of checkCommands) {
        if (!checkResults.has(c)) parts.push(`not run: ${c}`);
        else {
          const code = checkResults.get(c);
          if (code !== 0) parts.push(`exit ${code ?? "?"}: ${c}`);
        }
      }
      return parts.join("; ") || "checks incomplete";
    };

    const usagePayload = () => ({
      agentMode,
      openRouterSessionId: orSession,
      workerSessionId: agentMode === "thrift" ? orWorkerSession : undefined,
      promptTokens: turnUsage.promptTokens,
      completionTokens: turnUsage.completionTokens,
      totalTokens: turnUsage.totalTokens,
      costUsd: turnUsage.costUsd ?? 0,
      generations,
      finishReason: lastFinishReason,
      maxTokens,
      model,
      routedModel: lastRoutedModel,
      checks: checkCommands.length ? checkCommands : undefined,
      checksGreen: checkCommands.length ? checksGreen() : undefined,
    });

    try {
      for (let i = 0; i < maxIters; i++) {
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
            routedModel: lastRoutedModel,
            agentMode,
            openRouterSessionId: orSession,
          }),
        );

        const toolCalls: ProviderToolCall[] = [];
        let assistantText = "";
        let reasoningText = "";
        const reasoningDetails: unknown[] = [];
        const argBuf: Record<number, { id: string; name: string; args: string }> = {};
        let iterFinishReason = "stop";

        const messagesForModel = compactToolMessages(session.messages, {
          keepRecentTools: keepRecentToolResults,
        });

        for await (const ev of provider.chat(messagesForModel, {
          model,
          tools: TOOL_SCHEMAS,
          signal,
          sessionId: orSession,
          maxTokens,
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
            iterFinishReason = ev.finishReason || "stop";
            lastFinishReason = iterFinishReason;
            if (ev.model && ev.model !== model) lastRoutedModel = ev.model;
            if (ev.usage) {
              track(ev.usage);
              if (ev.usage.routedModel && ev.usage.routedModel !== model) {
                emit(
                  agentEvent("status", session.id, {
                    message: `Routed · ${ev.usage.routedModel}`,
                    iteration: i + 1,
                    model,
                    routedModel: ev.usage.routedModel,
                    agentMode,
                  }),
                );
              }
              if (ev.usage.promptTokens >= PROMPT_HIGH_TOKENS) {
                emit(
                  agentEvent("status", session.id, {
                    message: `High context · ${ev.usage.promptTokens.toLocaleString()} prompt tokens — consider a fresh chat`,
                    iteration: i + 1,
                    model,
                    routedModel: lastRoutedModel,
                    agentMode,
                    promptTokens: ev.usage.promptTokens,
                  }),
                );
              } else if (ev.usage.promptTokens >= PROMPT_WARN_TOKENS) {
                emit(
                  agentEvent("status", session.id, {
                    message: `Context growing · ${ev.usage.promptTokens.toLocaleString()} prompt tokens`,
                    iteration: i + 1,
                    model,
                    routedModel: lastRoutedModel,
                    agentMode,
                    promptTokens: ev.usage.promptTokens,
                  }),
                );
              }
            }
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

        if (iterFinishReason === "length") {
          emit(
            agentEvent("status", session.id, {
              message: "Output truncated (finish_reason=length) — prefer smaller edits or raise max tokens",
              iteration: i + 1,
              model,
              routedModel: lastRoutedModel,
              agentMode,
              finishReason: "length",
            }),
          );
          session.messages.push({ role: "system", content: LENGTH_NUDGE });
          if (!toolCalls.length) {
            // Still allow check-until-green to continue after truncation nudge.
            if (!(checkCommands.length && !checksGreen() && checkRetries < MAX_CHECK_RETRIES)) {
              session.status = "done";
              emit(agentEvent("done", session.id, { message: "Truncated (length)", ...usagePayload() }));
              return;
            }
          }
        }

        if (!toolCalls.length) {
          if (checkCommands.length && !checksGreen() && checkRetries < MAX_CHECK_RETRIES) {
            checkRetries++;
            const detail = checksPendingDetail();
            emit(
              agentEvent("status", session.id, {
                message: `Check-until-green · retry ${checkRetries}/${MAX_CHECK_RETRIES} · ${detail}`,
                iteration: i + 1,
                model,
                routedModel: lastRoutedModel,
                agentMode,
                checks: checkCommands,
              }),
            );
            session.messages.push({
              role: "system",
              content: CHECK_UNTIL_GREEN_NUDGE(checkCommands, detail),
            });
            continue;
          }
          if (checkCommands.length && !checksGreen()) {
            session.status = "done";
            emit(
              agentEvent("done", session.id, {
                message: `Verification failed after ${checkRetries} retries · ${checksPendingDetail()}`,
                ...usagePayload(),
              }),
            );
            return;
          }
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

          if (name === "write_file" && typeof args.path === "string") {
            const n = (writePathCounts.get(args.path) ?? 0) + 1;
            writePathCounts.set(args.path, n);
            if (n >= 3) {
              emit(
                agentEvent("status", session.id, {
                  message: `Repeated full rewrite of ${args.path} (${n}×) — prefer edit_file`,
                  iteration: i + 1,
                  model,
                  agentMode,
                }),
              );
            }
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
              sessionId: session.id,
              pendingChanges: this.opts.pendingChanges,
              onPendingChange: (change) => {
                const store = this.opts.pendingChanges;
                emit(
                  agentEvent("change.pending", session.id, {
                    ...(store ? store.meta(change) : change),
                    baseline: change.baseline,
                  }),
                );
              },
            });
            emit(agentEvent("tool.result", session.id, { toolCallId, toolName: name, result }));
            session.messages.push({ role: "tool", tool_call_id: toolCallId, content: result });

            if (name === "execute_command" && checkCommands.length) {
              const executed = parseExecutedCommand(args);
              const code = parseCommandExitCode(result);
              for (const check of checkCommands) {
                if (commandMatchesCheck(executed, check)) {
                  checkResults.set(check, code);
                  emit(
                    agentEvent("status", session.id, {
                      message:
                        code === 0
                          ? `Check green · ${check}`
                          : `Check failed (exit ${code ?? "?"}) · ${check}`,
                      iteration: i + 1,
                      model,
                      routedModel: lastRoutedModel,
                      agentMode,
                      check,
                      exitCode: code,
                    }),
                  );
                }
              }
            }
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

import { agentEvent, type AgentEvent } from "./events.js";
import {
  commandMatchesCheck,
  extractCheckCommands,
  parseCommandExitCode,
  parseCommandStreams,
  parseExecutedCommand,
} from "./check-commands.js";
import { compactMessages, CHARS_PER_TOKEN } from "./context-compact.js";
import {
  looksUnfinished,
  MAX_REASONING_NUDGES,
  MAX_REPEAT_NUDGES,
  MAX_UNFINISHED_NUDGES,
  REASONING_LOOP_NUDGE,
  REPEAT_TOOL_NUDGE,
  UNFINISHED_TURN_NUDGE,
} from "./continuation.js";
import { extractRequirements } from "./ledger/extract.js";
import { gateNudge, isBareCompletionClaim } from "./ledger/gate.js";
import { ledgerFile } from "./ledger/report.js";
import { renderLedgerPrompt, renderLedgerReminder } from "./ledger/render.js";
import { LedgerRunner, type GateRun } from "./ledger/runner.js";
import { hydrate, LEDGER_PATH, loadSpec, readLedgerFile, writeLedgerFile } from "./ledger/store.js";
import { createLedgerHandle } from "./ledger/update.js";
import { appendReasoning } from "./reasoning-text.js";
import type { LLMProvider, ProviderMessage, ProviderToolCall, ProviderUsage } from "./provider.js";
import { isRouterModel, openRouterSessionId } from "./provider.js";
import { AgentSession } from "./session.js";
import { APPROVAL_REQUIRED, toolSchemasFor } from "./tools/schema.js";
import { createToolHandlers } from "./tools/handlers.js";
import type { PendingChangeStore } from "../services/pending-changes.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { AgentMode } from "../settings/defaults.js";

const EDIT_BIAS = `Prefer edit_file for fixes; use write_file/create_file for new files or intentional full rewrites only — do not rewrite an entire file to fix one error.
When a command or test prints an error or shape mismatch, fix that specific issue next; do not ignore tool output.
Do not invent library APIs — inspect installed packages or use the simplest documented form.
If output was truncated (finish_reason=length), make a smaller change or ask to raise max tokens / start a fresh chat.
Don't overthink: keep reasoning short; take the simplest next tool action instead of long speculation or redesign monologues.`;

/**
 * Self-verification rules. A completion claim is a claim, not evidence: the
 * harness runs the checks and writes the verdicts.
 */
const VERIFY_RULES = `Verify your own work; do not describe it.
Every requirement you were given is in a ledger at the top of this conversation. Mark each line with update_ledger as it becomes true, with a quote copied verbatim from output you actually produced. Invented quotes are rejected against the real tool results.
Do not claim done while a line is TODO, or while a check is red. Fix the work instead of the description.
Never substitute silently: if a required library, tool or feature cannot work here, record update_ledger(id, "deviation", note) with what you did instead. It will be listed in the report.
Never shrink tests, data or parameters to make something pass. After a timeout, profile and diagnose before reducing anything — and label any reduction you do keep.
Write acceptance checks before the implementation when the spec has testable lines. A suite that passes while required behavior is stubbed is not evidence.
Leave no stubs in code you touched: no TODO, "would", "in practice", placeholder, constant-returning functions or unused imports.`;

const SYSTEM_NORMAL = `You are Cadan, an autonomous coding agent in a local workspace IDE.
If the workspace has an AGENTS.md file, read it at the start of a new conversation for workspace-specific guidance.
Use tools to inspect and edit files. Prefer small, correct changes.
${EDIT_BIAS}
${VERIFY_RULES}
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
If the workspace has a virtual environment (e.g. .venv/bin/python), use it for all Python commands — never bare \`python\`.
When the user mentions a file by name, search for it directly — do not list the workspace first. Prefer search_files over list_files for orientation; list_files returns every file including logs and build artifacts and can be very large. Use list_files only before creating a new file to match neighboring conventions.
Act on reasonable assumptions; do not ask clarifying questions unless blocked. Don't overthink — ship the next edit or command.
When done, briefly summarize what you changed.`;

const SYSTEM_THRIFT = `You are Cadan, an autonomous coding agent in a local workspace IDE (thrift mode).
If the workspace has an AGENTS.md file, read it at the start of a new conversation for workspace-specific guidance.
Use tools to inspect and edit files. Prefer small, correct changes.
${EDIT_BIAS}
${VERIFY_RULES}
Before creating a new file, list the workspace and read a neighboring file to match existing conventions (language, extension, style).
When asked to write code, create or edit files in the workspace — never paste code only into your reply.
Match the file type of existing files in the workspace; do not default to markdown when the workspace uses code files.
After writing runnable code, execute it to verify before claiming success.
If the workspace has a virtual environment (e.g. .venv/bin/python), use it for all Python commands — never bare \`python\`.
When the user mentions a file by name, search for it directly — do not list the workspace first. Prefer search_files over list_files for orientation; list_files returns every file including logs and build artifacts and can be very large. Use list_files only before creating a new file to match neighboring conventions.
Bulk file reads over the line threshold return an outline only — follow up with startLine/endLine or search_files for the slices you need. Do not ask for the full file body when an outline suffices.
Files you create or write in this turn are never blocked on re-read — you can read them back in full to validate.
Act on reasonable assumptions; do not ask clarifying questions unless blocked. Don't overthink — ship the next edit or command.
When done, briefly summarize what you changed.`;

const LENGTH_NUDGE =
  "Your previous model response was truncated (finish_reason=length). Prefer edit_file for a minimal fix; avoid full-file rewrites; or ask the user to raise max tokens / start a fresh chat with less history.";

const CHECK_UNTIL_GREEN_NUDGE = (checks: string[], detail: string) =>
  `Verification not green yet (${detail}). Run these check command(s) with execute_command, fix failures with edit_file, and do not stop until every check exits 0:\n${checks.map((c) => `- ${c}`).join("\n")}`;

const AUTO_CONTINUE_NUDGE =
  "You reached this turn's step budget while still working. Continue with the next tool call right away — do not summarize, do not ask what to do next, and do not redo work you already finished.";

const DEFAULT_MODEL = process.env.CADAN_MODEL ?? "openrouter/free";
const MAX_CHECK_RETRIES = 5;
/** Completion-gate retries before the turn ends with an explicit FAIL report. */
const MAX_GATE_RETRIES = 4;

/** Model calls per budget segment. Reaching it grants an auto-continue, not a stop. */
export const DEFAULT_MAX_ITERATIONS = 50;
/** Extra segments granted while the model keeps making tool-call progress. */
const MAX_AUTO_CONTINUES = 3;

export function clampMaxIterations(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_MAX_ITERATIONS;
  return Math.min(400, Math.max(4, Math.round(v)));
}

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
  /** Model calls per budget segment before an auto-continue nudge (default 50). */
  maxIterations?: number;
  /** Completion budget passed to the provider (default 4096). */
  maxTokens?: number;
  /**
   * Prompt budget in tokens. The conversation is compacted to fit before each model
   * call, so a long session degrades older history instead of overflowing the window.
   * Measured usage tightens this further within a turn (see `PROMPT_BUDGET_TOKENS`).
   */
  promptBudgetTokens?: number;
  /** Workspace-relative file paths to inject as context before the user message. */
  contextFiles?: string[];
  pendingChanges?: PendingChangeStore;
  emit: (event: AgentEvent) => void;
}

/**
 * Prompt budget when the caller doesn't specify one. Deliberately well under the
 * smallest window OpenRouter routes to (32k): an over-budget request is a hard 400
 * that ends the turn, while an under-budget one just compacts a little more.
 */
const PROMPT_BUDGET_TOKENS = 24_000;

/** Fractions of the active prompt budget that trip the "context growing" statuses. */
const PROMPT_WARN_RATIO = 0.75;
const PROMPT_HIGH_RATIO = 0.9;

/** Provider-reported context overflow — a retryable shape, not a dead turn. */
const CONTEXT_OVERFLOW_RE =
  /maximum context length is (\d+) tokens.*?resulted in (\d+) tokens/i;

/**
 * Turn a provider's context-overflow 400 into advice the user can act on.
 * OpenRouter's message nests a raw provider string several layers deep, so the
 * original text is kept after the summary — but the summary leads.
 */
function contextOverflowMessage(raw: string): string {
  const m = CONTEXT_OVERFLOW_RE.exec(raw);
  if (!m) {
    return (
      "Context overflow — the conversation no longer fits this model's window. " +
      "Start a fresh chat to continue."
    );
  }
  const limit = Number(m[1]);
  const needed = Number(m[2]);
  return (
    `Context overflow — the conversation needed ${needed.toLocaleString()} tokens but this ` +
    `model's window is ${limit.toLocaleString()}. Older tool results and reasoning were already ` +
    `trimmed, so what remains is the current request itself. Start a fresh chat, split the ` +
    `work into smaller requests, or lower Prompt budget in Settings.`
  );
}

/** Compact-and-retry a context overflow at a reduced budget (bounded, per turn). */
const CONTEXT_OVERFLOW_RETRIES = 2;
const CONTEXT_OVERFLOW_BACKOFF = 0.5;

/** OpenRouter wraps provider errors in a few shapes; match the overflow wording. */
function isContextOverflow(message: string): boolean {
  return /maximum context length|context length exceeded|prompt is too long|too many tokens/i.test(message);
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
    let model = this.opts.model ?? process.env.CADAN_MODEL ?? DEFAULT_MODEL;
    const pinRouted = process.env.CADAN_PIN_ROUTED_MODEL === "1";
    let pinned = false;
    const agentMode: AgentMode = this.opts.agentMode ?? "normal";
    const maxIterations = clampMaxIterations(this.opts.maxIterations);
    const maxTokens = this.opts.maxTokens ?? 4096;
    let budgetTokens = this.opts.promptBudgetTokens ?? PROMPT_BUDGET_TOKENS;
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
    let repeatNudges = 0;
    let unfinishedNudges = 0;
    let reasoningNudges = 0;
    let lastFinishReason: string | undefined;
    let lastRoutedModel: string | undefined;
    const writePathCounts = new Map<string, number>();
    const checkCommands = extractCheckCommands(userText);
    /** Latest exit code per check command (undefined = never run). */
    const checkResults = new Map<string, number | null>();
    let checkRetries = 0;
    let stepBudget = checkCommands.length ? maxIterations + MAX_CHECK_RETRIES : maxIterations;
    let maxIters = stepBudget * (MAX_AUTO_CONTINUES + 1);
    let autoContinues = 0;
    let contextRetries = 0;

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

    // ---- Requirements ledger -------------------------------------------------
    // Derived from the spec (or the request itself) before any work starts, so
    // "done" is measured against the spec rather than the model's memory of it.
    const spec = await loadSpec(workspace, root, userText);
    const derived = extractRequirements(spec?.text ?? userText, spec?.path);
    const ledger = derived.items.length ? derived : null;
    const ledgerHandle = ledger ? createLedgerHandle(ledger) : null;
    const runner = ledgerHandle
      ? new LedgerRunner({
          workspace,
          root,
          handle: ledgerHandle,
          writtenThisTurn,
        })
      : null;
    const toolSchemas = toolSchemasFor(Boolean(ledgerHandle));
    let gateRun: GateRun | null = null;
    let gateRetries = 0;
    let gateReported = false;

    const ensureGate = async (): Promise<GateRun> => {
      gateRun ??= await runner!.run(checkRecords());
      return gateRun;
    };

    const checkRecords = () =>
      checkCommands.map((command) => ({ command, code: checkResults.get(command) ?? null }));

    /** Everything the finish payload needs, including the harness's own verdict. */
    const finishPayload = async (message?: string) => {
      const base = usagePayload();
      if (!ledgerHandle) return message ? { message, ...base } : base;
      const gate = await ensureGate();
      await writeLedgerFile(workspace, root, gate.ledgerFile).catch(() => {});
      if (!gateReported) {
        gateReported = true;
        emit(
          agentEvent("verify", session.id, {
            verdict: gate.verdict,
            summary: gate.summary,
            report: gate.report,
            blockers: gate.blockers.length,
            warnings: gate.warnings.length,
            ledgerPath: LEDGER_PATH,
            items: ledgerHandle.ledger.items.map((i) => ({
              id: i.id,
              kind: i.kind,
              status: i.status,
              verdict: i.verdict ?? null,
              detail: i.detail ?? null,
            })),
          }),
        );
      }
      return {
        ...(message ? { message } : {}),
        ...base,
        verification: gate.verdict,
        verificationSummary: gate.summary,
        report: gate.report,
        ledgerPath: LEDGER_PATH,
      };
    };

    if (ledgerHandle) {
      stepBudget += MAX_GATE_RETRIES;
      maxIters = stepBudget * (MAX_AUTO_CONTINUES + 1);
      hydrate(ledger!, await readLedgerFile(workspace, root));
      await writeLedgerFile(workspace, root, ledgerFile(ledger!, [])).catch(() => {});
      emit(
        agentEvent("verify", session.id, {
          phase: "ledger",
          items: ledgerHandle.ledger.items.length,
          specPath: ledger!.specPath ?? null,
          ledgerPath: LEDGER_PATH,
        }),
      );
      session.messages.push({ role: "system", content: renderLedgerPrompt(ledger!) });
    }

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
        // Budget segment spent while the model was still calling tools — extend
        // instead of ending the turn, so long tasks don't need a manual "continue".
        if (i > 0 && i % stepBudget === 0 && autoContinues < MAX_AUTO_CONTINUES) {
          autoContinues++;
          emit(
            agentEvent("status", session.id, {
              message: `Step budget reached · auto-continuing (${autoContinues}/${MAX_AUTO_CONTINUES})`,
              iteration: i + 1,
              model,
              routedModel: lastRoutedModel,
              agentMode,
            }),
          );
          session.messages.push({ role: "system", content: AUTO_CONTINUE_NUDGE });
          if (ledgerHandle) {
            session.messages.push({ role: "system", content: renderLedgerReminder(ledger!) });
          }
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
        let reasoningLooped = false;
        /** Set when an error stream was abandoned to retry at a smaller budget. */
        let overflowed = false;

        const compacted = compactMessages(session.messages, budgetTokens * CHARS_PER_TOKEN);
        const messagesForModel = compacted.messages;
        if (compacted.compacted || compacted.dropped) {
          emit(
            agentEvent("status", session.id, {
              message:
                `Context trimmed · ${compacted.compacted} message(s) compacted` +
                (compacted.dropped ? `, ${compacted.dropped} dropped` : "") +
                ` · ~${Math.round(compacted.chars / CHARS_PER_TOKEN).toLocaleString()} tokens`,
              iteration: i + 1,
              model,
              routedModel: lastRoutedModel,
              agentMode,
              promptTokens: Math.round(compacted.chars / CHARS_PER_TOKEN),
            }),
          );
        }

        for await (const ev of provider.chat(messagesForModel, {
          model,
          tools: toolSchemas,
          signal,
          sessionId: orSession,
          maxTokens,
          onRetry: (info) =>
            emit(
              agentEvent("status", session.id, {
                message: `${info.reason} · retry ${info.attempt} in ${(info.delayMs / 1000).toFixed(1)}s`,
                iteration: i + 1,
                model,
                routedModel: lastRoutedModel,
                agentMode,
              }),
            ),
        })) {
          if (ev.type === "reasoning.delta") {
            if (ev.text) {
              // Forward only the text that actually became visible. Reasoning
              // models stream newline tokens liberally; relaying them raw sends
              // thousands of events that render as nothing and re-render the
              // chat on every one.
              const appended = appendReasoning(reasoningText, ev.text);
              reasoningText = appended.text;
              if (appended.increment) {
                emit(agentEvent("reasoning.delta", session.id, { text: appended.increment }));
              }
              if (isReasoningLoop(reasoningText)) {
                reasoningLooped = true;
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
            // A context overflow means our prompt was too big, not that the request was
            // bad. Trim harder and resend rather than ending the turn on a raw 400.
            if (isContextOverflow(ev.message) && contextRetries < CONTEXT_OVERFLOW_RETRIES) {
              contextRetries++;
              budgetTokens = Math.floor(budgetTokens * CONTEXT_OVERFLOW_BACKOFF);
              emit(
                agentEvent("status", session.id, {
                  message: `Context overflow · retrying with a ${budgetTokens.toLocaleString()} token budget`,
                  iteration: i + 1,
                  model,
                  routedModel: lastRoutedModel,
                  agentMode,
                  promptTokens: budgetTokens,
                }),
              );
              // Break, not continue: the provider stream is finished after an error, so
              // `continue` would just fall out of this loop and never resend anything.
              // The outer iteration re-runs compaction at the smaller budget.
              overflowed = true;
              break;
            }
            session.status = "error";
            emit(
              agentEvent("error", session.id, {
                message: isContextOverflow(ev.message)
                  ? contextOverflowMessage(ev.message)
                  : ev.message,
                ...usagePayload(),
              }),
            );
            return;
          } else if (ev.type === "finish") {
            iterFinishReason = ev.finishReason || "stop";
            lastFinishReason = iterFinishReason;
            if (ev.model && ev.model !== model) lastRoutedModel = ev.model;
            // Opt-in: hold the routed backend for the rest of the turn so a router
            // (openrouter/free) can't swap tool-call quality mid-task.
            if (pinRouted && !pinned && isRouterModel(model) && ev.model && !isRouterModel(ev.model)) {
              pinned = true;
              lastRoutedModel = ev.model;
              model = ev.model;
              emit(
                agentEvent("status", session.id, {
                  message: `Pinned · ${ev.model}`,
                  iteration: i + 1,
                  model,
                  routedModel: ev.model,
                  agentMode,
                }),
              );
            }
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
              // Thresholds track the active budget: a session trimmed to fit can still
              // sit close to its ceiling, and a tightened budget moves the goalposts.
              if (ev.usage.promptTokens >= budgetTokens * PROMPT_HIGH_RATIO) {
                emit(
                  agentEvent("status", session.id, {
                    message: `High context · ${ev.usage.promptTokens.toLocaleString()} prompt tokens of ${budgetTokens.toLocaleString()} — consider a fresh chat`,
                    iteration: i + 1,
                    model,
                    routedModel: lastRoutedModel,
                    agentMode,
                    promptTokens: ev.usage.promptTokens,
                  }),
                );
              } else if (ev.usage.promptTokens >= budgetTokens * PROMPT_WARN_RATIO) {
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

        // Abandoned mid-stream to retry smaller: nothing was generated, so don't push a
        // half-formed assistant message or record a finish reason for it.
        if (overflowed) continue;

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
        if (reasoningText && !reasoningLooped) assistantMsg.reasoning = reasoningText;
        if (reasoningDetails.length && !reasoningLooped) {
          assistantMsg.reasoning_details = reasoningDetails;
        }
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

          // Completion gate: the text reply is a claim, not evidence. The harness
          // measures the ledger and refuses the claim while lines are unverified.
          if (ledgerHandle) {
            const gate = await ensureGate();
            if (gate.verdict === "fail" && gateRetries < MAX_GATE_RETRIES) {
              gateRetries++;
              emit(
                agentEvent("status", session.id, {
                  message:
                    `Completion gate · ${gate.blockers.length} blocking · retry ${gateRetries}/${MAX_GATE_RETRIES}` +
                    (isBareCompletionClaim(assistantText) ? " · bare claim rejected" : ""),
                  iteration: i + 1,
                  model,
                  routedModel: lastRoutedModel,
                  agentMode,
                }),
              );
              // Re-measure next time — the fix may change the verdicts.
              gateRun = null;
              session.messages.push({
                role: "system",
                content: gateNudge(ledger!, gate.blockers, gateRetries, MAX_GATE_RETRIES),
              });
              continue;
            }
          }

          // The model answered instead of acting. Reasoning loops and truncated
          // replies land here too — nudge a bounded number of times before
          // letting the turn end.
          if (reasoningLooped && reasoningNudges < MAX_REASONING_NUDGES) {
            reasoningNudges++;
            emit(
              agentEvent("status", session.id, {
                message: `Reasoning loop · nudging (${reasoningNudges}/${MAX_REASONING_NUDGES})`,
                iteration: i + 1,
                model,
                routedModel: lastRoutedModel,
                agentMode,
              }),
            );
            session.messages.push({ role: "system", content: REASONING_LOOP_NUDGE });
            continue;
          }
          if (
            !reasoningLooped &&
            unfinishedNudges < MAX_UNFINISHED_NUDGES &&
            looksUnfinished(assistantText, { iterations: i })
          ) {
            unfinishedNudges++;
            emit(
              agentEvent("status", session.id, {
                message: `No tool call · nudging (${unfinishedNudges}/${MAX_UNFINISHED_NUDGES})`,
                iteration: i + 1,
                model,
                routedModel: lastRoutedModel,
                agentMode,
              }),
            );
            session.messages.push({ role: "system", content: UNFINISHED_TURN_NUDGE });
            continue;
          }

          if (checkCommands.length && !checksGreen()) {
            session.status = "done";
            emit(
              agentEvent("done", session.id, {
                ...(await finishPayload(
                  `Verification failed after ${checkRetries} retries · ${checksPendingDetail()}`,
                )),
              }),
            );
            return;
          }
          // Why the turn is ending without a tool call — reported so the UI can explain
          // itself instead of the user guessing.
          const stallReason = reasoningLooped
            ? `Reasoning loop did not recover after ${MAX_REASONING_NUDGES} warning(s)`
            : looksUnfinished(assistantText, { iterations: i })
              ? `Model kept replying without a tool call after ${MAX_UNFINISHED_NUDGES} nudge(s)`
              : iterFinishReason === "length"
                ? "Truncated (length)"
                : undefined;
          session.status = "done";
          emit(agentEvent("done", session.id, await finishPayload(stallReason)));
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
            if (repeatNudges < MAX_REPEAT_NUDGES) {
              repeatNudges++;
              emit(
                agentEvent("status", session.id, {
                  message: `Repeated tool call · nudging (${repeatNudges}/${MAX_REPEAT_NUDGES})`,
                  iteration: i + 1,
                  model,
                  agentMode,
                }),
              );
              session.messages.push({ role: "system", content: REPEAT_TOOL_NUDGE });
              toolRepeatCount = 0;
            } else {
              emit(
                agentEvent("status", session.id, {
                  message: "Repetitive tool calls detected — stopping",
                  iteration: i + 1,
                  model,
                  agentMode,
                }),
              );
              session.status = "done";
              emit(
                agentEvent("done", session.id, {
                  ...(await finishPayload(
                    `Repetitive tool calls — the model repeated the same call after ${MAX_REPEAT_NUDGES} warning(s)`,
                  )),
                }),
              );
              return;
            }
          }
        } else {
          toolRepeatCount = 0;
          repeatNudges = 0;
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
              ...(ledgerHandle ? { ledger: ledgerHandle } : {}),
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
            ledgerHandle?.recordToolResult(name, result);

            if (name === "execute_command") {
              const executed = parseExecutedCommand(args);
              const code = parseCommandExitCode(result);
              if (ledgerHandle) {
                const { stdout, stderr } = parseCommandStreams(result);
                ledgerHandle.recordCommand({ command: executed, code, stdout, stderr });
              }
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
      emit(
        agentEvent("done", session.id, {
          ...(await finishPayload(
            `Step budget exhausted after ${maxIters} model calls (${autoContinues} auto-continue${
              autoContinues === 1 ? "" : "s"
            }) — send another message to keep going`,
          )),
        }),
      );
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

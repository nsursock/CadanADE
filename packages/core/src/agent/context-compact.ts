import type { ProviderMessage } from "./provider.js";

/** Rough chars-per-token for source code and JSON — deliberately low so budgets err small. */
const CHARS_PER_TOKEN = 3;

const TOOL_STUB_MAX = 400;
const PROSE_STUB_MAX = 600;
const REASONING_STUB_MAX = 300;

/** Tail of a string for stubs (prefers last lines when content looks like logs). */
export function tailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(-maxChars);
  const nl = sliced.indexOf("\n");
  const body = nl >= 0 && nl < maxChars / 4 ? sliced.slice(nl + 1) : sliced;
  return `…[truncated]\n${body}`;
}

/** Prompt chars a message costs on the wire — the unit a compaction budget is spent in. */
export function messageChars(msg: ProviderMessage): number {
  let n = (msg.content ?? "").length;
  if (msg.reasoning) n += msg.reasoning.length;
  if (msg.reasoning_details?.length) {
    try {
      n += JSON.stringify(msg.reasoning_details).length;
    } catch {
      n += msg.reasoning_details.length * 200;
    }
  }
  for (const call of msg.tool_calls ?? []) n += call.function.name.length + call.function.arguments.length;
  return n;
}

function dropReasoningDetails(msg: ProviderMessage): ProviderMessage {
  const { reasoning_details: _dropped, ...rest } = msg;
  return rest;
}

function shrinkReasoning(msg: ProviderMessage, maxChars: number): ProviderMessage {
  if (!msg.reasoning) return msg;
  if (msg.reasoning.length <= maxChars) return msg;
  return { ...msg, reasoning: tailText(msg.reasoning, maxChars) };
}

function shrinkContent(msg: ProviderMessage, maxChars: number): ProviderMessage {
  const raw = typeof msg.content === "string" ? msg.content : "";
  if (raw.length <= maxChars) return msg;
  const stub = msg.role === "tool" ? `[compacted tool result · ${raw.length} chars]` : `[compacted]`;
  return { ...msg, content: `${stub}\n${tailText(raw, maxChars)}` };
}

/**
 * Progressively cheaper forms of one message, ordered by how much context they cost
 * least to lose: structured reasoning blocks go first (the model does not need them to
 * read its own earlier decisions), then reasoning prose, then the body itself.
 *
 * `tool_calls` is never touched — providers reject a tool result whose call arguments
 * changed, so pairing and fidelity win over compaction here.
 */
function* degrade(msg: ProviderMessage): Generator<ProviderMessage> {
  if (msg.reasoning_details?.length) yield dropReasoningDetails(msg);
  yield shrinkReasoning(msg, REASONING_STUB_MAX);
  yield shrinkContent(msg, msg.role === "tool" ? TOOL_STUB_MAX : PROSE_STUB_MAX);
  const stubMax = msg.role === "tool" ? 80 : 160;
  yield shrinkReasoning(msg, stubMax);
  yield shrinkContent(msg, stubMax);
  yield { ...msg, content: "[compacted]", reasoning: undefined, reasoning_details: undefined };
}

/** Build the cheapest ladder form (last yield) for a message we could not make fit. */
function minimal(msg: ProviderMessage): ProviderMessage {
  let form: ProviderMessage | undefined;
  for (const step of degrade(msg)) form = step;
  return form ?? msg;
}

/**
 * Shrink a conversation until it fits `budgetChars`.
 *
 * Walks newest → oldest so the working context (what the model is doing right now) is
 * the first thing to survive, and degrades older messages along the ladder above. If even
 * the fully degraded history is over budget — hundreds of turns, each with tool results —
 * whole assistant+tool groups are dropped from the oldest end. Messages are never dropped
 * while the budget is reachable by degrading alone, because deleting an assistant message
 * that has `tool_calls` orphans the tool results that follow it.
 *
 * `messages` is not mutated; the caller keeps the full history on the session.
 */
export function compactMessages(
  messages: ProviderMessage[],
  budgetChars: number,
): { messages: ProviderMessage[]; chars: number; compacted: number; dropped: number } {
  const total = () => messages.reduce((sum, m) => sum + messageChars(m), 0);

  if (total() <= budgetChars) return { messages, chars: total(), compacted: 0, dropped: 0 };

  // Index 0 is the system prompt (rewritten every turn), so it is never truncated.
  // The newest user message is the live request and is also kept verbatim. Nothing else is
  // pinned: the newest-first walk already spends the budget on recent context first, and
  // pinning the whole live turn would let one huge assistant message overflow on its own.
  const pinnedIndexes = new Set<number>([0]);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      pinnedIndexes.add(i);
      break;
    }
  }
  const pinnedMessages = new Set<ProviderMessage>(
    [...pinnedIndexes].map((i) => messages[i]).filter((m): m is ProviderMessage => Boolean(m)),
  );

  const kept: Array<ProviderMessage | undefined> = new Array(messages.length);
  let used = 0;
  let compacted = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    if (pinnedIndexes.has(i)) {
      kept[i] = msg;
      used += messageChars(msg);
      continue;
    }
    const size = messageChars(msg);
    if (used + size <= budgetChars) {
      kept[i] = msg;
      used += size;
      continue;
    }
    let picked: ProviderMessage | undefined;
    for (const step of degrade(msg)) {
      if (used + messageChars(step) <= budgetChars) {
        picked = step;
        break;
      }
    }
    if (!picked) {
      picked = minimal(msg);
      compacted++;
    } else if (picked !== msg) {
      compacted++;
    }
    kept[i] = picked;
    used += messageChars(picked);
  }

  let list = kept.filter((m): m is ProviderMessage => m !== undefined);
  let dropped = messages.length - list.length;
  let chars = list.reduce((sum, m) => sum + messageChars(m), 0);

  if (chars <= budgetChars) return { messages: list, chars, compacted, dropped };

  // Still over after degrading everything: shed whole assistant+tool groups, oldest first.
  // Eligibility is by message identity, not index: removing a message shifts every later
  // index, and an index-based guard would eventually walk into the live turn and drop the
  // one message that has to survive.
  const keep = new Set<ProviderMessage>(pinnedMessages);
  let i = 1;
  while (chars > budgetChars && i < list.length) {
    const msg = list[i];
    if (!msg || keep.has(msg)) {
      i++;
      continue;
    }
    const start = i;
    // Absorb a whole assistant+tool group: splitting it would orphan tool results from
    // the call that produced them, which providers reject.
    let end = i + 1;
    while (end < list.length && list[end]?.role === "tool") end++;
    const group = list.slice(start, end);
    const groupChars = group.reduce((sum, m) => sum + messageChars(m), 0);
    for (const m of group) keep.add(m);
    list = [...list.slice(0, start), ...list.slice(end)];
    chars -= groupChars;
    dropped += end - start;
  }

  return { messages: list, chars, compacted, dropped };
}

/** Cap shell tool payloads before they enter the conversation. */
export function capCommandResult(
  result: { stdout: string; stderr: string; code: number | null },
  opts?: { maxStdout?: number; maxStderr?: number },
): { stdout: string; stderr: string; code: number | null; truncated?: boolean } {
  const maxStdout = opts?.maxStdout ?? 8_000;
  const maxStderr = opts?.maxStderr ?? 4_000;
  let truncated = false;
  let { stdout, stderr, code } = result;
  if (stdout.length > maxStdout) {
    stdout = tailText(stdout, maxStdout);
    truncated = true;
  }
  if (stderr.length > maxStderr) {
    stderr = tailText(stderr, maxStderr);
    truncated = true;
  }
  return truncated ? { stdout, stderr, code, truncated: true } : { stdout, stderr, code };
}

export { CHARS_PER_TOKEN };
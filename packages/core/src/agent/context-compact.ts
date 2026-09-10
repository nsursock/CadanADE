import type { ProviderMessage } from "./provider.js";

const DEFAULT_KEEP_RECENT_TOOLS = 6;
const TOOL_STUB_MAX = 400;

/** Tail of a string for stubs (prefers last lines when content looks like logs). */
export function tailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(-maxChars);
  const nl = sliced.indexOf("\n");
  const body = nl >= 0 && nl < maxChars / 4 ? sliced.slice(nl + 1) : sliced;
  return `…[truncated]\n${body}`;
}

/**
 * Shrink old tool-role messages so long agent sessions do not balloon prompt tokens.
 * Keeps the most recent `keepRecentTools` tool results intact; older ones become short stubs.
 * Returns a shallow-copied message list (original array is not mutated).
 */
export function compactToolMessages(
  messages: ProviderMessage[],
  opts?: { keepRecentTools?: number; stubMaxChars?: number },
): ProviderMessage[] {
  const keepRecent = opts?.keepRecentTools ?? DEFAULT_KEEP_RECENT_TOOLS;
  const stubMax = opts?.stubMaxChars ?? TOOL_STUB_MAX;

  const toolIndexes: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "tool") toolIndexes.push(i);
  }
  if (toolIndexes.length <= keepRecent) return messages;

  const compactBefore = new Set(toolIndexes.slice(0, toolIndexes.length - keepRecent));
  return messages.map((msg, i) => {
    if (!compactBefore.has(i) || msg.role !== "tool") return msg;
    const raw = typeof msg.content === "string" ? msg.content : "";
    if (raw.length <= stubMax) return msg;
    return {
      ...msg,
      content: `[compacted tool result · ${raw.length} chars]\n${tailText(raw, stubMax)}`,
    };
  });
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

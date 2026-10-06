import type { ChatMessage, ChatPart } from "@cadan/core";

function formatTool(part: Extract<ChatPart, { kind: "tool" }>): string {
  const { tool } = part;
  const lines = [`[Tool: ${tool.name} · ${tool.status}]`];
  if (tool.args !== undefined) {
    lines.push(typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2));
  }
  if (tool.result) lines.push(tool.result);
  if (tool.error) lines.push(`Error: ${tool.error}`);
  return lines.join("\n");
}

function formatPart(part: ChatPart): string {
  switch (part.kind) {
    case "reasoning":
      // Reasoning renders as flowing prose, so a transcript that kept the raw
      // whitespace would print walls of blank lines for a stream that was
      // mostly newlines.
      return part.text.trim() ? `[Reasoning]\n${part.text.replace(/\s+/g, " ").trim()}` : "";
    case "text":
      return part.text;
    case "tool":
      return formatTool(part);
  }
}

/**
 * Belt and braces: no transcript should ever contain a wall of blank lines or
 * a stranded fragment. Collapsing `\n{3,}` alone is not enough — a run of
 * spaces never produces three consecutive newlines, so a whitespace-flooded
 * tool result or message slips through with its content marooned on either
 * side of the gap. Stripping trailing horizontal whitespace first turns those
 * lines into empty ones, which the newline cap then collapses.
 */
function collapseBlankRuns(text: string): string {
  return text
    .replace(/[^\S\n]*$/gm, "")
    .replace(/[^\S\n]{3,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n");
}

/** Always-verbose plain-text transcript for clipboard export. */
export function formatChatTranscript(messages: ChatMessage[]): string {
  const blocks: string[] = [];

  for (const msg of messages) {
    const label = msg.role === "user" ? "You" : msg.role === "assistant" ? "Cadan" : "System";
    let body = "";

    if (msg.role === "assistant" && msg.parts?.length) {
      body = msg.parts
        .map(formatPart)
        .filter((s) => s.trim().length > 0)
        .join("\n\n");
    } else {
      body = msg.content ?? "";
    }

    if (!body.trim() && msg.role === "assistant") continue;
    blocks.push(`### ${label}\n${collapseBlankRuns(body.trim())}`);
  }

  return collapseBlankRuns(blocks.join("\n\n"));
}

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
      return part.text.trim() ? `[Reasoning]\n${part.text}` : "";
    case "text":
      return part.text;
    case "tool":
      return formatTool(part);
  }
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
    blocks.push(`### ${label}\n${body.trim()}`);
  }

  return blocks.join("\n\n");
}

/** Mentions a verification runner somewhere in the string. */
const CHECK_HINT =
  /\b(?:pytest|npm\s+test|pnpm\s+test|yarn\s+test|vitest|cargo\s+test|go\s+test|make\s+test|python3?\s+-c\s+|python3?\s+-m\s+pytest|npx\s+[\w@./-]*test|uv\s+run\s+pytest)/i;

/**
 * Must look like an actual shell invocation, not prose that merely mentions pytest.
 * Allows env prefixes and .venv/bin/ wrappers.
 */
function looksLikeShellCheck(raw: string): boolean {
  const t = raw.replace(/^\$\s*/, "").trim();
  if (!t || t.length >= 400) return false;
  if (/^(do not|don't|keep|fix|until|run|then|please|make sure)\b/i.test(t)) return false;

  const stripped = t.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/, "");
  const startsWithRunner =
    /^(?:\.\/)?(?:[\w.-]+\/)*?(?:bin\/)?(?:python3?|pytest|npm|pnpm|yarn|vitest|cargo|go|make|npx|uv)\b/i.test(
      stripped,
    );
  return startsWithRunner && CHECK_HINT.test(stripped);
}

/**
 * Pull likely verification shell commands from the user message
 * (fenced blocks, backticks, or bare lines).
 */
export function extractCheckCommands(text: string): string[] {
  const found: string[] = [];

  for (const m of text.matchAll(/```(?:bash|sh|shell|zsh|console)?\n([\s\S]*?)```/gi)) {
    for (const line of m[1].split("\n")) {
      const t = line.replace(/^\$\s*/, "").trim();
      if (looksLikeShellCheck(t)) found.push(t);
    }
  }

  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim();
    if (looksLikeShellCheck(t)) found.push(t);
  }

  for (const line of text.split("\n")) {
    const t = line.replace(/^\$\s*/, "").trim();
    if (looksLikeShellCheck(t)) found.push(t);
  }

  return [...new Set(found)];
}

export function commandMatchesCheck(executed: string, check: string): boolean {
  const a = executed.trim();
  const b = check.trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function parseCommandExitCode(toolResultJson: string): number | null {
  try {
    const parsed = JSON.parse(toolResultJson) as { code?: number | null };
    return typeof parsed.code === "number" ? parsed.code : null;
  } catch {
    return null;
  }
}

export function parseExecutedCommand(args: Record<string, unknown>): string {
  return String(args.command ?? "").trim();
}

/**
 * Normalize streamed reasoning into readable prose.
 *
 * OpenRouter reasoning models often emit one token (or one char) per chunk with
 * trailing newlines. Naively collapsing each chunk then concatenating either:
 * - eats word spaces when a whitespace-only delta is discarded (`run` + `a` → `runa`)
 * - inserts spaces before extensions / flags (`scale` + `.py` → `scale .py`)
 */

/** Collapse internal whitespace runs; trim ends. */
export function collapseReasoningWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Cap whitespace floods in assistant text without flattening its structure.
 *
 * Reasoning is collapsed to a single line, but assistant text carries meaning
 * in its whitespace — lists, indented code, blank-line paragraph breaks — so a
 * blanket `/\s+/g → " "` would destroy it. Instead horizontal runs are capped
 * and vertical runs capped at one blank line, which is enough to stop a model
 * that streams newline or space tokens freely from flooding the transcript with
 * a wall that separates every fragment from its neighbours.
 */
export function normalizeTextDelta(text: string): string {
  return text
    .replace(/[^\S\n]{3,}/g, "  ")
    .replace(/[^\S\n]*\n(?:[^\S\n]*\n)+/g, "\n\n");
}

/** Odd count of backticks means we are inside an unclosed code span. */
function insideCodeSpan(left: string): boolean {
  return (left.match(/`/g)?.length ?? 0) % 2 === 1;
}

/**
 * Boundaries that are never a word break, even straight after a newline token.
 *
 * Reasoning models emit newline tokens freely, so `appendDelta` treats them as a
 * pending space and skips the gluing rules. That is right for prose but wrong
 * inside a code span or a literal: "`(" + "1,)" came out as "`( 1,)`.", and
 * "`log_alpha`" drifted apart. These characters are structural, so they glue
 * regardless of a pending space.
 */
function isTightBoundary(left: string, delta: string): boolean {
  // Closing punctuation never opens a new word: `)` `.` `,` `]`
  if (/^[.,;:!?…)\]}]/u.test(delta)) return true;
  // An unclosed opener keeps its contents together: `(1,)` `[a, b]`
  if (/[({\[]$/u.test(left)) return true;
  // Inside a backtick span, whitespace is literal: `log_alpha`
  if (insideCodeSpan(left)) return true;
  return false;
}

function glueWithoutSpace(left: string, delta: string): boolean {
  // Char / digit stream inside a word (only when no pending space — caller checks).
  if (/^[\p{L}\p{N}]$/u.test(delta) && /[\p{L}\p{N}]$/u.test(left)) return true;
  // Apostrophes: don't / can't
  if (/^['’]$/u.test(delta)) return true;
  if (/['’]$/u.test(left) && /^[\p{L}\p{N}]$/u.test(delta)) return true;
  // Closing punctuation
  if (/^[.,;:!?…)\]}]+$/u.test(delta)) return true;
  // File extensions / dotted suffixes: .py .md .yaml
  if (/^\.\w/.test(delta)) return true;
  // Flag / path continuations: --envs, utils/bench
  if (/[-/]$/.test(left) && /^[\w]/.test(delta)) return true;
  if (left.endsWith("--") && /^[\w]/.test(delta)) return true;
  // Ranges: 64-512
  if (/-$/.test(left) && /^\d/.test(delta)) return true;
  if (/^-$/u.test(delta) && /\d$/.test(left)) return true;
  // Open brackets
  if (/[({\[]$/u.test(left)) return true;
  // Number continuations: 3.14 / 1_000
  if (/[\d.]$/.test(left) && /^\d/.test(delta)) return true;
  if (/_$/.test(left) && /^\d/.test(delta)) return true;
  return false;
}

/**
 * Append a raw reasoning delta onto accumulated text with sensible spacing.
 * Whitespace-only deltas become a single pending trailing space so the next
 * word does not glue onto the previous one.
 */
export function appendReasoningText(existing: string, rawDelta: string): string {
  return appendReasoning(existing, rawDelta).text;
}

export interface ReasoningAppend {
  /** Full accumulated text after the delta — what the agent should remember. */
  text: string;
  /**
   * Only the newly visible text, or "" when the delta added none.
   *
   * Normalization is lossy (whitespace runs collapse), so this is the only part
   * worth forwarding to a UI or an event stream. Reasoning models emit newline
   * tokens freely — forwarding those raw floods the client with thousands of
   * events that render as nothing.
   */
  increment: string;
}

export function appendReasoning(existing: string, rawDelta: string): ReasoningAppend {
  const next = appendDelta(existing, rawDelta);
  const grew = next.length > existing.length && next.startsWith(existing);
  const added = grew ? next.slice(existing.length) : "";
  // A whitespace-only gain is a word boundary, not content: the boundary is kept
  // in `text` for the next delta, and nothing is forwarded.
  return { text: next, increment: added.trim() ? added : "" };
}

function appendDelta(existing: string, rawDelta: string): string {
  if (!rawDelta) return existing;

  // Preserve word boundaries from whitespace-only chunks.
  if (/^\s+$/.test(rawDelta)) {
    if (!existing) return "";
    return existing.replace(/\s+$/, "") + " ";
  }

  const delta = collapseReasoningWhitespace(rawDelta);
  if (!delta) {
    // Newlines / mixed whitespace that collapse to empty → treat as a space.
    if (/\s/.test(rawDelta)) {
      if (!existing) return "";
      return existing.replace(/\s+$/, "") + " ";
    }
    return existing;
  }

  if (!existing) return delta;

  const pendingSpace = /\s$/.test(existing);
  const left = existing.replace(/\s+$/, "");

  if (isTightBoundary(left, delta)) {
    return left + delta;
  }

  if (!pendingSpace && glueWithoutSpace(left, delta)) {
    return left + delta;
  }

  // Pending space before an extension/flag continuation → still glue
  // (`scale ` + `.py` → `scale.py`).
  if (pendingSpace && (/^\.\w/.test(delta) || (/[-/]$/.test(left) && /^[\w]/.test(delta)))) {
    return left + delta;
  }

  return `${left} ${delta}`;
}

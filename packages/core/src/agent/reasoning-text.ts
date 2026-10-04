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

/**
 * Spec → requirements ledger. Deliberately generic: no project knowledge, no
 * language knowledge beyond "does this token look like a package name".
 *
 * One line per MUST / STRICT / "do not" / numeric limit / named library /
 * banned dependency / named deliverable, in spec order, capped so a long spec
 * cannot blow the prompt budget (machine-checkable kinds win the cut, and the
 * lines the cap drops are reported rather than silently forgotten).
 */

import {
  BAN_CUE_RE,
  DELIVERABLE_RE,
  MIN_CANDIDATE_CHARS,
  PROHIBITION_RE,
  PROSE_PACKAGE_RE,
  PROSE_PATH_RE,
  REQUIREMENT_RE,
  RANGE_RE,
  STRICT_RE,
  isPackageLike,
  isPathLike,
  isSelfPath,
  limitFrom,
  namedSpans,
} from "./patterns.js";
import type { Ledger, LedgerItem, LedgerKind } from "./types.js";

export const MAX_LEDGER_ITEMS = 24;

const MAX_TEXT = 200;

interface Candidate {
  kind: LedgerKind;
  text: string;
  subject?: string;
  order: number;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "").replace(/^#{1,6}\s*/, "").trim();
}

function clip(s: string, max = MAX_TEXT): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

function packageSubjects(line: string): string[] {
  const found: string[] = [];
  for (const span of namedSpans(line)) if (isPackageLike(span)) found.push(span);
  for (const m of line.matchAll(PROSE_PACKAGE_RE)) {
    if (isPackageLike(m[1])) found.push(m[1]);
  }
  return [...new Set(found)];
}

function pathSubjects(line: string): string[] {
  const found: string[] = [];
  for (const span of namedSpans(line)) if (isPathLike(span)) found.push(span);
  for (const m of line.matchAll(PROSE_PATH_RE)) {
    if (isPathLike(m[1])) found.push(m[1]);
  }
  return [...new Set(found.filter((p) => !isSelfPath(p)))];
}

function bannedSubject(line: string): string | null {
  const spans = new Set(namedSpans(line));
  for (const m of line.matchAll(BAN_CUE_RE)) {
    const name = (m[1] ?? "").trim();
    if (!isPackageLike(name)) continue;
    // A bare hyphenated English word ("never force-push …") is not a dependency.
    if (/[.:]/.test(name) || name.startsWith("@") || spans.has(name)) return name;
  }
  return null;
}

function checkFor(kind: LedgerKind, subject: string | undefined): string {
  switch (kind) {
    case "library":
      return `${subject} imported and called in code — not just mentioned or listed`;
    case "banned":
      return `${subject} absent from code and from dependency files`;
    case "deliverable":
      return `${subject} exists and is non-empty`;
    case "limit":
      return "measured by running the thing — attach the command output, do not assume";
    case "range":
      return "attach the output that reports these values — they must fall inside the range";
    case "prohibition":
      return "attach output showing the banned thing is absent";
    default:
      return "attach output that shows this holds";
  }
}

/** Long paragraphs are split so one "do not" can't classify a whole page. */
function splitSentences(line: string): string[] {
  if (line.length <= 180) return [line];
  return line
    .split(/(?<=[.;!?])\s+(?=[A-Z`*"'\[])|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lines inside fenced code are commands, not requirements. */
function specLines(text: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const raw of text.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const line = stripListMarker(raw);
    if (line.length >= MIN_CANDIDATE_CHARS) out.push(...splitSentences(line));
  }
  return out;
}

/** Machine-checkable kinds first when the spec has more lines than the cap. */
const KIND_PRIORITY: Record<LedgerKind, number> = {
  banned: 0,
  limit: 1,
  range: 2,
  library: 3,
  deliverable: 4,
  prohibition: 5,
  requirement: 6,
};

export function extractRequirements(specText: string, specPath?: string): Ledger {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let order = 0;

  const push = (kind: LedgerKind, text: string, subject?: string) => {
    const key = `${kind}:${subject ?? clip(text).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ kind, text: clip(text), subject, order: order++ });
  };

  for (const line of specLines(specText ?? "")) {
    const prohibited = PROHIBITION_RE.test(line);
    const limit = limitFrom(line);
    const range = RANGE_RE.exec(line);
    const required = REQUIREMENT_RE.test(line) || STRICT_RE.test(line);
    const produces = DELIVERABLE_RE.test(line);

    if (!prohibited && !limit && !range && !required && !produces) continue;

    // A prohibition or a bounded number *is* the obligation for that line —
    // emitting a second "requirement" copy would double the gate for no gain.
    if (prohibited) {
      const subject = bannedSubject(line);
      if (subject) push("banned", line, subject);
      else push("prohibition", line);
      continue;
    }

    if (limit) push("limit", line, `${limit.value} ${limit.unit}`);
    else if (range) {
      push("range", line, `${Number(range[1] ?? range[3])}..${Number(range[2] ?? range[4])}`);
    } else if (required) {
      push("requirement", line);
    }
    if (produces) for (const p of pathSubjects(line)) push("deliverable", line, p);
    for (const lib of packageSubjects(line)) push("library", line, lib);
  }

  const dropped = Math.max(0, candidates.length - MAX_LEDGER_ITEMS);
  const kept =
    dropped === 0
      ? candidates
      : candidates
          .slice()
          .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.order - b.order)
          .slice(0, MAX_LEDGER_ITEMS)
          .sort((a, b) => a.order - b.order);

  const items: LedgerItem[] = kept.map((c, i) => ({
    id: `R${i + 1}`,
    kind: c.kind,
    text: c.text,
    subject: c.subject,
    check: checkFor(c.kind, c.subject),
    status: "todo",
  }));

  return {
    ...(specPath ? { specPath } : {}),
    // Never drop spec lines silently — the model is told what the cap hid.
    ...(dropped > 0 ? { truncated: dropped } : {}),
    items,
  };
}

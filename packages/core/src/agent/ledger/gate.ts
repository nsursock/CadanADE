/**
 * The completion gate. "Done" is not a state the model can assert — it is a
 * state the harness grants, and only when every ledger line has a verdict the
 * harness is willing to stand behind.
 */

import type { Finding, Ledger } from "./types.js";

export type GateVerdict = "pass" | "deviations" | "fail";

const BARE_CLAIM =
  /^\s*(?:[✅✔✓]\s*)?(?:(?:all\s+)?(?:done|complete|completed|finished|success(?:ful)?|passed|green)\s*[.!]?\s*)$/i;

export function gateVerdict(ledger: Ledger, blockers: Finding[]): GateVerdict {
  if (blockers.length) return "fail";
  if (!ledger.items.length) return "pass";
  // Every line waved through as a deviation is the same as no verification.
  if (ledger.items.every((i) => i.status === "deviation")) return "fail";
  return ledger.items.some((i) => i.status === "deviation") ? "deviations" : "pass";
}

/** A claim with nothing behind it — rejected in favour of the gate. */
export function isBareCompletionClaim(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  if (BARE_CLAIM.test(t)) return true;
  return /^[✅✔✓\s.!]+$/.test(t);
}

export function blockingSummary(ledger: Ledger, blockers: Finding[], max = 12): string {
  const lines: string[] = [];
  for (const item of ledger.items) {
    if (item.verdict !== "fail" && item.verdict !== "unverified") continue;
    lines.push(`${item.id} [${item.kind}] ${item.verdict?.toUpperCase()} — ${item.text} · ${item.detail ?? ""}`);
  }
  for (const b of blockers) {
    if (b.kind.startsWith("ledger:")) continue;
    lines.push(`- ${b.path ? `${b.path}${b.line ? `:${b.line}` : ""}: ` : ""}${b.detail}`);
  }
  return lines.slice(0, max).join("\n");
}

export function gateNudge(ledger: Ledger, blockers: Finding[], attempt: number, max: number): string {
  const open = ledger.items.filter((i) => i.status !== "done").length;
  return [
    `Completion gate (attempt ${attempt}/${max}): ${blockers.length} problem(s) block the report, ${open} line(s) still open.`,
    "A completion claim is not evidence. Fix the lines below with real work and record each one:",
    blockingSummary(ledger, blockers),
    "",
    "Then record progress with update_ledger(id, \"done\", evidence) where evidence.quote is copied verbatim",
    "from output you actually produced this turn — quotes are checked against the real tool results and",
    "rejected if invented. Do not shrink tests, data or parameters to make something pass; if you had to,",
    "record it as a deviation. If a requirement genuinely cannot be met in this workspace, record",
    "update_ledger(id, \"deviation\", note) with the reason instead of silently substituting something else.",
  ].join("\n");
}
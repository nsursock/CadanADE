/**
 * Evidence rules: what counts as proof, and how a stated limit is measured
 * against it.
 *
 * The model may attach a quote; only the harness decides whether the quote is
 * real. A quote that doesn't appear in output the agent actually produced this
 * turn is not evidence, however confident the sentence around it is.
 */

import { matchesEvidenceCommand, normalizeOutput } from "./text.js";
import type { LedgerItem, LedgerObservations } from "./types.js";

/** Shorter than this and a quote is noise, not proof. */
export const MIN_QUOTE = 12;

/** Compatible units for comparing a measured number against a stated limit. */
const UNIT_FAMILY: Record<string, { family: string; toBase: (n: number) => number }> = {
  ms: { family: "time", toBase: (n) => n / 1000 },
  s: { family: "time", toBase: (n) => n },
  seconds: { family: "time", toBase: (n) => n },
  minutes: { family: "time", toBase: (n) => n * 60 },
  h: { family: "time", toBase: (n) => n * 3600 },
  hours: { family: "time", toBase: (n) => n * 3600 },
  bytes: { family: "size", toBase: (n) => n },
  chars: { family: "size", toBase: (n) => n },
  kb: { family: "size", toBase: (n) => n * 1024 },
  mb: { family: "size", toBase: (n) => n * 1024 * 1024 },
  gb: { family: "size", toBase: (n) => n * 1024 * 1024 * 1024 },
  lines: { family: "lines", toBase: (n) => n },
  tokens: { family: "tokens", toBase: (n) => n },
  rows: { family: "rows", toBase: (n) => n },
  items: { family: "items", toBase: (n) => n },
  files: { family: "files", toBase: (n) => n },
};

const MEASURED_RE =
  /(-?\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|min|mins|minutes?|h|hours?|kb|mb|gb|bytes?|lines?|chars?|characters?|tokens?|rows?|records?|items?|files?|entries)\b/gi;

export interface EvidenceResult {
  ok: boolean;
  where?: string;
  problem?: string;
}

/** The quote must exist in something the harness actually saw this turn. */
export function checkEvidence(item: LedgerItem, obs: LedgerObservations): EvidenceResult {
  const ev = item.evidence;
  if (!ev) return { ok: false, problem: "no evidence attached" };
  const quote = normalizeOutput(ev.quote);
  if (quote.length < MIN_QUOTE) {
    return { ok: false, problem: `evidence quote is shorter than ${MIN_QUOTE} characters` };
  }
  if (ev.command) {
    const rec = obs.commands.find((c) => matchesEvidenceCommand(c.command, ev.command!));
    if (!rec) return { ok: false, problem: `no command matching \`${ev.command}\` was run this turn` };
    const output = normalizeOutput(`${rec.stdout}\n${rec.stderr}`);
    if (!output.includes(quote)) {
      return { ok: false, problem: `quote is not in the output of \`${ev.command}\` (exit ${rec.code})` };
    }
    return { ok: true, where: `exit ${rec.code} of \`${ev.command}\`` };
  }
  const hit = obs.tools.find((t) => normalizeOutput(t.text).includes(quote));
  if (!hit) return { ok: false, problem: "quote does not appear in any tool result from this turn" };
  return { ok: true, where: `${hit.tool} result` };
}

/**
 * A limit is only satisfied by a measurement. Numbers carrying the same unit as
 * the limit are compared against it; other numbers in the quote are ignored, so
 * "180 ms across 3 runs" cannot fail a 200 ms budget on the count alone.
 */
export function limitVerdict(
  item: LedgerItem,
  evidence: EvidenceResult,
): { verdict: "pass" | "fail"; detail: string } {
  const parsed = /^(\d+(?:\.\d+)?)\s+(\S+)$/.exec(item.subject ?? "");
  if (!parsed) return { verdict: "pass", detail: evidence.where ?? "measured" };
  const limitValue = Number(parsed[1]);
  const limitUnit = parsed[2].toLowerCase();
  const family = UNIT_FAMILY[limitUnit];
  if (!family) return { verdict: "pass", detail: evidence.where ?? "measured" };

  const quote = normalizeOutput(item.evidence?.quote ?? "");
  let compared = 0;
  for (const m of quote.matchAll(MEASURED_RE)) {
    const unit = UNIT_FAMILY[(m[2] ?? "").toLowerCase()];
    if (!unit || unit.family !== family.family) continue;
    compared++;
    const value = Number(m[1]) * unit.toBase(1);
    if (value > family.toBase(limitValue)) {
      return {
        verdict: "fail",
        detail: `evidence reports ${m[1]} ${m[2]} which exceeds the ${limitValue} ${limitUnit} limit`,
      };
    }
  }
  const suffix = compared ? ` · ${compared} measurement(s) within the ${limitValue} ${limitUnit} limit` : "";
  return { verdict: "pass", detail: `${evidence.where ?? "measured"}${suffix}` };
}
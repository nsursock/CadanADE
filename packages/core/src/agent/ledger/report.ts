/**
 * The final report is generated from the ledger, never from the model's prose.
 * Every line carries a verdict and the evidence behind it, so a bare "done" has
 * nowhere to hide.
 */

import { renderLedgerFile } from "./render.js";
import { gateVerdict, type GateVerdict } from "./gate.js";
import type { Finding, Ledger, LedgerVerdict } from "./types.js";

export interface CheckRecord {
  command: string;
  code: number | null;
}

export interface ReportInput {
  ledger: Ledger;
  blockers: Finding[];
  warnings: Finding[];
  checks: CheckRecord[];
}

const VERDICT_ICON: Record<LedgerVerdict, string> = {
  pass: "PASS",
  fail: "FAIL",
  deviation: "DEVIATION",
  unverified: "UNVERIFIED",
};

export function countVerdicts(ledger: Ledger): Record<LedgerVerdict, number> {
  const counts: Record<LedgerVerdict, number> = { pass: 0, fail: 0, deviation: 0, unverified: 0 };
  for (const item of ledger.items) {
    if (item.verdict) counts[item.verdict]++;
  }
  return counts;
}

function heading(verdict: GateVerdict): string {
  if (verdict === "pass") return "PASS — every ledger line is verified";
  if (verdict === "deviations") return "PASS WITH DEVIATIONS — see below";
  return "FAIL — the task is not verified";
}

export function buildReport(input: ReportInput): string {
  const { ledger, blockers, warnings, checks } = input;
  const verdict = gateVerdict(ledger, blockers);
  const counts = countVerdicts(ledger);
  const deviations = ledger.items.filter((i) => i.status === "deviation");

  const lines: string[] = [
    `# Verification report`,
    "",
    heading(verdict),
    "",
    `Source: ${ledger.specPath ? `\`${ledger.specPath}\`` : "this request"} · ` +
      `${ledger.items.length} ledger line(s) · ${counts.pass} pass · ${counts.fail} fail · ` +
      `${counts.unverified} unverified · ${counts.deviation} deviation` +
      (ledger.truncated ? ` · ${ledger.truncated} spec line(s) not extracted (cap)` : ""),
    "",
    "## Ledger",
    "",
    "| id | kind | requirement | status | verdict | evidence |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of ledger.items) {
    const evidence = item.evidence
      ? `${item.evidence.command ? `\`${item.evidence.command}\` → ` : ""}“${item.evidence.quote}”`
      : "—";
    lines.push(
      `| ${item.id} | ${item.kind} | ${cell(item.text)} | ${item.status.toUpperCase()} | ` +
        `${item.verdict ? VERDICT_ICON[item.verdict] : "—"} | ${cell(evidence)} |`,
    );
  }

  if (checks.length) {
    lines.push("", "## Checks run", "");
    for (const c of checks) {
      lines.push(`- \`${c.command}\` → exit ${c.code ?? "?"} ${c.code === 0 ? "✅" : "❌"}`);
    }
  }

  lines.push("", "## Detail", "");
  for (const item of ledger.items) {
    if (item.verdict === "pass") continue;
    const why = item.status === "deviation" ? item.note ?? item.detail ?? "deviation" : item.detail ?? "";
    lines.push(`- **${item.id}** (${VERDICT_ICON[item.verdict ?? "unverified"]}) ${cell(item.text)}${why ? ` — ${cell(why)}` : ""}`);
  }

  if (deviations.length) {
    lines.push("", "## Deviations (nothing was substituted silently)", "");
    for (const d of deviations) {
      lines.push(`- **${d.id}** ${cell(d.text)} → ${cell(d.note ?? d.detail ?? "no reason recorded")}`);
    }
  }

  const reduced = warnings.filter((w) => w.kind === "reduced-run");
  if (reduced.length) {
    lines.push("", "## Reduced runs", "");
    for (const r of reduced) lines.push(`- ${r.detail}`);
  }

  const plausibility = warnings.filter((w) => w.kind !== "reduced-run");
  if (plausibility.length) {
    lines.push("", "## Plausibility", "");
    for (const w of plausibility) lines.push(`- ${w.kind}: ${w.detail}`);
  }

  const stubFindings = blockers.filter((b) => !b.kind.startsWith("ledger:"));
  if (stubFindings.length) {
    lines.push("", "## Blocking findings in changed code", "");
    for (const b of stubFindings.slice(0, 30)) {
      lines.push(`- ${b.path ? `\`${b.path}${b.line ? `:${b.line}` : ""}\` — ` : ""}${b.detail}`);
    }
  }

  return lines.join("\n") + "\n";
}

/** One line for the turn footer — the report carries the detail. */
export function reportSummary(ledger: Ledger, blockers: Finding[]): string {
  const verdict = gateVerdict(ledger, blockers);
  const counts = countVerdicts(ledger);
  const parts = [`${counts.pass}/${ledger.items.length} verified`];
  if (counts.deviation) parts.push(`${counts.deviation} deviation${counts.deviation === 1 ? "" : "s"}`);
  if (counts.fail) parts.push(`${counts.fail} failing`);
  if (counts.unverified) parts.push(`${counts.unverified} unverified`);
  return `${verdict === "pass" ? "PASS" : verdict === "deviations" ? "PASS/DEVIATIONS" : "FAIL"} · ${parts.join(" · ")}`;
}

function cell(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim() || "—";
}

/** The on-disk checklist, including harness verdicts. */
export function ledgerFile(ledger: Ledger, blockers: Finding[]): string {
  return renderLedgerFile(ledger, { blockers });
}
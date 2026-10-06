/**
 * Ledger rendering: the system-prompt block re-injected every turn, the
 * on-disk REQUIREMENTS.md checklist, and the parser that hydrates statuses back
 * on the next turn so a long task doesn't restart from blank.
 */

import type { Finding, Ledger, LedgerItem, LedgerStatus, LedgerVerdict } from "./types.js";

const STATUS_LABEL: Record<LedgerStatus, string> = {
  todo: "TODO",
  done: "DONE",
  deviation: "DEVIATION",
};

const VERDICT_LABEL: Record<LedgerVerdict, string> = {
  pass: "PASS",
  fail: "FAIL",
  deviation: "DEVIATION",
  unverified: "UNVERIFIED",
};

const MAX_PROMPT_TEXT = 130;

function oneLine(item: LedgerItem): string {
  const text = item.text.replace(/\s+/g, " ");
  const clipped = text.length > MAX_PROMPT_TEXT ? text.slice(0, MAX_PROMPT_TEXT - 1) + "…" : text;
  return `${item.id} [${item.kind}] ${STATUS_LABEL[item.status]} — ${clipped}`;
}

/** Injected as a system message at the start of every turn so the model can't drift. */
export function renderLedgerPrompt(ledger: Ledger): string {
  if (!ledger.items.length) return "";
  const source = ledger.specPath ? `the spec at \`${ledger.specPath}\`` : "this request";
  const open = ledger.items.filter((i) => i.status !== "done").length;
  return [
    `Requirements ledger — ${ledger.items.length} line(s) derived from ${source}. ` +
      `You are not allowed to report the task done while any line is TODO or fails.`,
    ...ledger.items.map(oneLine),
    "Per line: call update_ledger(id, status, evidence) as you satisfy it. Evidence quotes are matched " +
      "against real tool output from this turn and rejected if invented. If a required tool, library or " +
      "feature cannot work here, set status \"deviation\" with the reason — never substitute silently. " +
      "Do not shrink tests, data or parameters to get a pass; if you do, record it as a deviation. " +
      "The final report is generated from this ledger, so a bare ✅ is not accepted.",
    ledger.truncated
      ? `The ledger cap left ${ledger.truncated} further requirement line(s) of the spec out of the list. ` +
        "Those still bind — re-read the spec before claiming done."
      : "",
    open === 0 ? "All lines are marked DONE — run the checks and finish." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact re-injection for auto-continues and truncated turns. */
export function renderLedgerReminder(ledger: Ledger): string {
  const open = ledger.items.filter((i) => i.status !== "done");
  if (!open.length) return "Ledger: every line is marked DONE — run the checks and finish.";
  return [
    `Ledger — ${open.length} line(s) still open (do not report done yet):`,
    ...open.slice(0, 10).map((i) => `${i.id} [${i.kind}] ${i.text.replace(/\s+/g, " ").slice(0, 100)}`),
  ].join("\n");
}

/** The human-readable checklist file the brief asks for. */
export function renderLedgerFile(ledger: Ledger, opts?: { blockers?: Finding[] }): string {
  const lines: string[] = [
    "# Requirements ledger",
    "",
    `Source: ${ledger.specPath ? `\`${ledger.specPath}\`` : "this chat request"} · ` +
      `${ledger.items.length} line(s) · written by Cadan, verdicts written by the harness` +
      (ledger.truncated ? ` · ${ledger.truncated} further spec line(s) not extracted (cap)` : ""),
    "",
    "| id | kind | requirement | check | status | verdict | evidence | note |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of ledger.items) {
    lines.push(
      `| ${item.id} | ${item.kind} | ${cell(item.text)} | ${cell(item.check)} | ${STATUS_LABEL[item.status]} | ` +
        `${item.verdict ? VERDICT_LABEL[item.verdict] : "—"} | ${cell(evidenceText(item))} | ${cell(item.note ?? item.detail ?? "")} |`,
    );
  }
  lines.push(
    "",
    "Status is the agent's claim. Verdict is the harness's measurement:",
    "",
    "- PASS — the harness check ran and agreed.",
    "- FAIL — the harness check ran and disagreed (see note).",
    "- DEVIATION — recorded by the agent with a stated reason. Never silent.",
    "- UNVERIFIED — no measured evidence attached yet.",
  );

  const blockers = opts?.blockers ?? [];
  if (blockers.length) {
    lines.push("", "## Blocking findings", "");
    for (const b of blockers.slice(0, 40)) {
      lines.push(`- ${b.path ? `${b.path}${b.line ? `:${b.line}` : ""} — ` : ""}${b.detail}`);
    }
  }
  return lines.join("\n") + "\n";
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
}

function evidenceText(item: LedgerItem): string {
  if (!item.evidence) return "";
  const cmd = item.evidence.command ? `\`${item.evidence.command}\` → ` : "";
  return cmd + `"${item.evidence.quote}"`;
}

/** Split a markdown table row on unescaped pipes. */
function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());
}

export interface LedgerFileState {
  status: LedgerStatus;
  text: string;
  note?: string;
  evidence?: string;
}

/** Recover agent-recorded state so a resumed task keeps its ledger. */
export function parseLedgerFile(md: string): Map<string, LedgerFileState> {
  const out = new Map<string, LedgerFileState>();
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|") || /^\|\s*id\s*\|/i.test(line)) continue;
    const cols = splitRow(line);
    if (cols.length < 6) continue;
    const id = cols[0];
    if (!/^R\d+$/.test(id)) continue;
    const status = cols[4]?.toLowerCase();
    if (status !== "todo" && status !== "done" && status !== "deviation") continue;
    const note = cols[7];
    const evidence = cols[6];
    out.set(id, {
      status,
      text: cols[2] ?? "",
      ...(note && note !== "—" ? { note } : {}),
      ...(evidence && evidence !== "—" ? { evidence } : {}),
    });
  }
  return out;
}